// Isekai Habits — desktop window.
//
// A small native shell around the app: it shows the built app (the dist folder next to
// this program) in its own window with its own icon and taskbar entry, and reads and
// writes the save file for it, so syncing with iCloud Drive needs no file picker and
// no browser permission. It holds no game logic. Build it with desktop/build.bat.
//
// Same approach as the Hoshigatari Reader window, minus the local server: this app
// has no server side, so the built files are handed to the web view directly.

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IsekaiHabits;

static class Program
{
    [STAThread]
    static void Main()
    {
        // Only one window: starting the app again just brings the open one to the front.
        using var mutex = new Mutex(true, "IsekaiHabits.SingleInstance", out bool first);
        using var activate = new EventWaitHandle(false, EventResetMode.AutoReset, "IsekaiHabits.Activate");
        if (!first)
        {
            activate.Set();
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(activate));
    }
}

sealed class MainForm : Form
{
    // A made-up address that only exists inside this window; it maps to the dist folder.
    // ".example" is reserved, so Windows never tries to look it up on the network.
    const string Host = "isekai-habits.example";
    const string Origin = "https://" + Host;
    const string SaveFileName = "isekai-habits-save.json";
    static readonly Color Back = Color.FromArgb(0x09, 0x0b, 0x17);

    readonly WebView2 web = new() { Dock = DockStyle.Fill, Visible = false };
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Text = "Starting Isekai Habits…", Font = new Font("Segoe UI", 11f) };
    static readonly string root = FindRoot();
    readonly string stateDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IsekaiHabits");
    bool closing;

    public MainForm(EventWaitHandle activate)
    {
        Text = "Isekai Habits";
        MinimumSize = new Size(420, 560);
        using (var icon = typeof(MainForm).Assembly.GetManifestResourceStream("icon.ico"))
            if (icon != null) Icon = new Icon(icon);
        Controls.Add(web);
        Controls.Add(status);
        BackColor = Back;
        status.ForeColor = Color.FromArgb(0x8e, 0x97, 0xc2);
        web.DefaultBackgroundColor = Back;
        LoadBounds();

        var listener = new Thread(() =>
        {
            while (true)
            {
                activate.WaitOne();
                try { BeginInvoke(BringToFront_); } catch { /* window is closing */ }
            }
        }) { IsBackground = true };
        listener.Start();

        Shown += async (_, _) => await StartAsync();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int on = 1;
        int caption = 0x00170B09; // the app's background colour, as 0x00BBGGRR
        try
        {
            DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
            DwmSetWindowAttribute(Handle, 35 /* DWMWA_CAPTION_COLOR (Windows 11) */, ref caption, sizeof(int));
        }
        catch { /* older Windows */ }
    }

    // ---------- start-up ----------

    async Task StartAsync()
    {
        try
        {
            string dist = Path.Combine(root, "dist");
            if (!File.Exists(Path.Combine(dist, "index.html")))
                throw new FileNotFoundException("Could not find the built app (dist\\index.html). Keep \"Isekai Habits.exe\" inside the Isekai Habits folder, and run \"npm run build\" there once.");

            Directory.CreateDirectory(stateDir);
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(stateDir, "WebView2"));
            await web.EnsureCoreWebView2Async(env);
            var core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsSwipeNavigationEnabled = false;
            core.SetVirtualHostNameToFolderMapping(Host, dist, CoreWebView2HostResourceAccessKind.Allow);

            core.WebMessageReceived += OnWebMessage;
            // Right-click menu only where it is useful: in text boxes and on selected text.
            core.ContextMenuRequested += (_, e) =>
            {
                if (!e.ContextMenuTarget.IsEditable && !e.ContextMenuTarget.HasSelection) e.Handled = true;
            };
            // This window only ever shows the app itself; anything else opens in the normal browser.
            core.NewWindowRequested += (_, e) => { e.Handled = true; OpenExternally(e.Uri); };
            core.NavigationStarting += (_, e) =>
            {
                if (e.Uri.StartsWith(Origin + "/", StringComparison.OrdinalIgnoreCase) || e.Uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase) || e.Uri.StartsWith("blob:", StringComparison.OrdinalIgnoreCase)) return;
                e.Cancel = true;
                OpenExternally(e.Uri);
            };
            core.NavigationCompleted += (_, _) => { web.Visible = true; status.Visible = false; };
            core.Navigate(Origin + "/index.html");
        }
        catch (Exception ex)
        {
            status.Text = "Isekai Habits could not start.";
            MessageBox.Show(this, ex.Message, "Isekai Habits", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 4 && dir != null; i++, dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "dist", "index.html"))) return dir.FullName;
        return AppContext.BaseDirectory;
    }

    static void OpenExternally(string uri)
    {
        if (!uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return;
        try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true })?.Dispose(); } catch { /* no browser */ }
    }

    // ---------- the save file ----------
    //
    // The page asks for the save file with small messages: { id, cmd, text? }.
    // Every request gets one answer: { id, ok, text?, path?, error? }.

    string PathFile => Path.Combine(stateDir, "savefile.txt");

    /// <summary>Where the save file lives: the place the user chose, else iCloud Drive if it is on this PC, else a Data folder next to the program.</summary>
    string SavePath()
    {
        try
        {
            string chosen = File.ReadAllText(PathFile).Trim();
            if (chosen.Length > 0) return chosen;
        }
        catch { /* nothing chosen yet */ }

        string icloud = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "iCloudDrive");
        if (Directory.Exists(icloud))
        {
            string loose = Path.Combine(icloud, SaveFileName);
            return File.Exists(loose) ? loose : Path.Combine(icloud, "Isekai Habits", SaveFileName);
        }
        return Path.Combine(root, "Data", SaveFileName);
    }

    void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(Origin + "/", StringComparison.OrdinalIgnoreCase)) return;
        int id = 0;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var message = doc.RootElement;
            id = message.GetProperty("id").GetInt32();
            string cmd = message.GetProperty("cmd").GetString();
            string text = message.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            string path = SavePath();

            switch (cmd)
            {
                case "info":
                    Reply(new { id, ok = true, path });
                    break;

                case "read":
                    Reply(new { id, ok = true, path, text = File.Exists(path) ? File.ReadAllText(path) : "" });
                    break;

                case "write":
                    if (text == null) throw new InvalidOperationException("Nothing to save.");
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    // Write beside the file, then swap it in, so a crash can never leave half a save.
                    string temp = path + ".tmp";
                    File.WriteAllText(temp, text, new UTF8Encoding(false));
                    File.Move(temp, path, true);
                    Reply(new { id, ok = true, path });
                    break;

                case "choose":
                    using (var dialog = new SaveFileDialog
                    {
                        Title = "Where should Isekai Habits keep its save file?",
                        Filter = "Isekai Habits save (*.json)|*.json",
                        FileName = Path.GetFileName(path),
                        InitialDirectory = Directory.Exists(Path.GetDirectoryName(path)) ? Path.GetDirectoryName(path) : null,
                        OverwritePrompt = false, // picking an existing save means "use this one"; it is merged, not replaced
                    })
                    {
                        if (dialog.ShowDialog(this) == DialogResult.OK)
                        {
                            Directory.CreateDirectory(stateDir);
                            File.WriteAllText(PathFile, dialog.FileName);
                            Reply(new { id, ok = true, path = dialog.FileName, changed = true });
                        }
                        else Reply(new { id, ok = true, path, changed = false });
                    }
                    break;

                case "reveal":
                    if (File.Exists(path)) Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + path + "\"") { UseShellExecute = true })?.Dispose();
                    else if (Directory.Exists(Path.GetDirectoryName(path))) Process.Start(new ProcessStartInfo(Path.GetDirectoryName(path)) { UseShellExecute = true })?.Dispose();
                    Reply(new { id, ok = true, path });
                    break;

                case "retire":
                    // "Erase everything": the save is set aside under another name rather than deleted.
                    string kept = null;
                    if (File.Exists(path))
                    {
                        kept = Path.Combine(Path.GetDirectoryName(path), Path.GetFileNameWithoutExtension(path) + "-erased-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".json");
                        File.Move(path, kept);
                    }
                    Reply(new { id, ok = true, path, text = kept });
                    break;

                default:
                    throw new InvalidOperationException("Unknown request: " + cmd);
            }
        }
        catch (Exception ex)
        {
            Reply(new { id, ok = false, error = ex.Message });
        }
    }

    void Reply(object answer)
    {
        try { web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(answer)); } catch { /* window is closing */ }
    }

    // ---------- closing: let the page write its last save first ----------

    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        base.OnFormClosing(e);
        if (closing || e.Cancel || web.CoreWebView2 == null) { SaveBounds(); return; }
        e.Cancel = true;
        closing = true;
        SaveBounds();
        Hide();
        try
        {
            await web.CoreWebView2.ExecuteScriptAsync("window.isekaiFlush && window.isekaiFlush()");
            await Task.Delay(600);
        }
        catch { /* page not loaded */ }
        Close();
    }

    // ---------- window position ----------

    string BoundsFile => Path.Combine(stateDir, "window.txt");

    void LoadBounds()
    {
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1000, 940);
        try
        {
            string[] p = File.ReadAllText(BoundsFile).Split(',');
            var rect = new Rectangle(int.Parse(p[0]), int.Parse(p[1]), int.Parse(p[2]), int.Parse(p[3]));
            foreach (var screen in Screen.AllScreens)
            {
                var visible = Rectangle.Intersect(screen.WorkingArea, rect);
                if (visible.Width < 200 || visible.Height < 150) continue;
                StartPosition = FormStartPosition.Manual;
                Bounds = rect;
                break;
            }
            if (p.Length > 4 && p[4] == "max") WindowState = FormWindowState.Maximized;
        }
        catch { /* first start */ }
        var area = Screen.FromPoint(Location).WorkingArea;
        if (StartPosition == FormStartPosition.CenterScreen) Size = new Size(Math.Min(Width, area.Width), Math.Min(Height, area.Height));
    }

    void SaveBounds()
    {
        try
        {
            var r = WindowState == FormWindowState.Normal ? Bounds : base.RestoreBounds;
            Directory.CreateDirectory(stateDir);
            File.WriteAllText(BoundsFile, $"{r.X},{r.Y},{r.Width},{r.Height},{(WindowState == FormWindowState.Maximized ? "max" : "normal")}");
        }
        catch { /* not important */ }
    }

    void BringToFront_()
    {
        ShowWindow(Handle, 9 /* SW_RESTORE */);
        SetForegroundWindow(Handle);
    }

    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
}
