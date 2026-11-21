// Isekai Habits — desktop window.
//
// A small native shell around the app: it shows the built app (the dist folder next to
// this program) in its own window with its own icon and taskbar entry, and reads and
// writes the save file for it, so syncing with iCloud Drive needs no file picker and
// no browser permission. It also keeps a dated copy of the save each day, and shows the
// evening reminder. It holds no game logic. Build it with desktop/build.bat.
//
// Same approach as the Hoshigatari Reader window, minus the local server: this app
// has no server side, so the built files are handed to the web view directly.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace IsekaiHabits;

static class Program
{
    // "--profile <folder>" runs a separate copy for testing: its own settings, browser data
    // and save file, all inside that folder, so the real save is never touched.
    // "--exit-when-ready" closes the window as soon as the app is up, for timing the start-up.
    // "--remind" is how Windows runs the evening reminder: no window, only a notification.
    [STAThread]
    static void Main(string[] args)
    {
        StartupLog.Mark("program started");
        string profile = null;
        bool exitWhenReady = false, remind = false, test = false;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--profile" && i + 1 < args.Length) profile = Path.GetFullPath(args[++i]);
            else if (args[i] == "--exit-when-ready") exitWhenReady = true;
            else if (args[i] == "--remind") remind = true;
            else if (args[i] == "--test") test = true;
        }
        string scope = profile == null ? "" : "." + Hash(profile.ToLowerInvariant());
        string stateDir = profile ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IsekaiHabits");
        if (remind)
        {
            Reminder.Run(stateDir, profile, test);
            return;
        }

        // Only one window: starting the app again just brings the open one to the front.
        var mutex = new Mutex(true, "IsekaiHabits.SingleInstance" + scope, out bool first);
        using var activate = new EventWaitHandle(false, EventResetMode.AutoReset, "IsekaiHabits.Activate" + scope);
        if (!first)
        {
            activate.Set();
            mutex.Dispose();
            return;
        }
        ApplicationConfiguration.Initialize();
        var form = new MainForm(activate, stateDir, profile, scope, exitWhenReady);
        Application.Run(form);
        mutex.ReleaseMutex();
        mutex.Dispose();

        // Started again while it was still closing: open afresh now that the last one is fully gone.
        if (form.ReopenAfterClose && Environment.ProcessPath != null)
        {
            try
            {
                var again = new ProcessStartInfo(Environment.ProcessPath) { UseShellExecute = false };
                foreach (string arg in args) again.ArgumentList.Add(arg);
                Process.Start(again)?.Dispose();
            }
            catch { /* the user can start it again by hand */ }
        }
    }

    static string Hash(string text)
    {
        uint h = 2166136261;
        foreach (char c in text) h = (h ^ c) * 16777619;
        return h.ToString("x8");
    }
}

/// <summary>
/// The evening reminder. Windows starts the program with "--remind" at the chosen time; it reads
/// what the app last wrote down about the coming days (reminder.json) and, if habits are still
/// open today, shows a notification. Clicking it opens the app.
/// </summary>
static class Reminder
{
    public const string BriefFile = "reminder.json";

    public static void Run(string stateDir, string profile, bool test)
    {
        string title = "Isekai Habits";
        string body = "Your habits are waiting.";
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(stateDir, BriefFile)));
            var root = doc.RootElement;
            JsonElement note;
            if (root.GetProperty("days").TryGetProperty(DateTime.Now.ToString("yyyy-MM-dd"), out note))
            {
                // Everything done, or nothing to do: no reminder today.
                if (note.GetProperty("left").GetInt32() <= 0 && !test) return;
            }
            else note = root.GetProperty("away");
            title = note.GetProperty("title").GetString() ?? title;
            body = note.GetProperty("body").GetString() ?? body;
        }
        catch { /* the app has not written anything down yet: the plain reminder will do */ }

        ApplicationConfiguration.Initialize();
        using var tray = new NotifyIcon { Text = "Isekai Habits" };
        using (var icon = typeof(Reminder).Assembly.GetManifestResourceStream("icon.ico"))
            tray.Icon = icon != null ? new Icon(icon, 32, 32) : SystemIcons.Application;
        tray.Visible = true;
        void Leave() { tray.Visible = false; Application.ExitThread(); }
        tray.BalloonTipClicked += (_, _) =>
        {
            try
            {
                var app = new ProcessStartInfo(Environment.ProcessPath) { UseShellExecute = false };
                if (profile != null) { app.ArgumentList.Add("--profile"); app.ArgumentList.Add(profile); }
                Process.Start(app)?.Dispose();
            }
            catch { /* the user can open it by hand */ }
            Leave();
        };
        tray.BalloonTipClosed += (_, _) => Leave();
        using var giveUp = new System.Windows.Forms.Timer { Interval = 30000 };
        giveUp.Tick += (_, _) => Leave();
        giveUp.Start();
        tray.ShowBalloonTip(15000, title, body, ToolTipIcon.None);
        Application.Run();
    }
}

/// <summary>How long each step of starting up took, kept as startup.txt beside the window settings.</summary>
static class StartupLog
{
    static readonly Stopwatch clock = Stopwatch.StartNew();
    // The time Windows and .NET needed before the first line of this program ran.
    static readonly double before = Math.Max(0, (DateTime.Now - Process.GetCurrentProcess().StartTime).TotalMilliseconds);
    static readonly List<string> lines = new();

    public static void Mark(string step)
    {
        lock (lines) lines.Add($"{before + clock.Elapsed.TotalMilliseconds,6:0} ms  {step}");
    }

    public static void Save(string folder)
    {
        try
        {
            lock (lines) File.WriteAllLines(Path.Combine(folder, "startup.txt"), lines);
        }
        catch { /* not important */ }
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
    readonly string stateDir;
    readonly string profile;
    readonly string taskName;
    readonly bool testProfile;
    readonly bool exitWhenReady;
    bool closing;
    bool leaving;
    bool wantedAgain;
    bool ready;

    /// <summary>The app was started again while this window was closing.</summary>
    public bool ReopenAfterClose { get; private set; }

    public MainForm(EventWaitHandle activate, string stateDir, string profile, string scope, bool exitWhenReady)
    {
        this.stateDir = stateDir;
        this.profile = profile;
        testProfile = profile != null;
        taskName = "Isekai Habits reminder" + (testProfile ? " (test" + scope + ")" : "");
        this.exitWhenReady = exitWhenReady;
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
                try { BeginInvoke(Activated_); } catch { /* window is closing */ }
            }
        }) { IsBackground = true };
        listener.Start();

        Shown += async (_, _) =>
        {
            StartupLog.Mark("window shown");
            await StartAsync();
        };
        StartupLog.Mark("window created");
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
            // The app's address is made up, and the browser engine would still spend two seconds
            // asking the network where it is before using the files on disk. This answers at once.
            var options = new CoreWebView2EnvironmentOptions("--host-resolver-rules=\"MAP " + Host + " 127.0.0.1\"");
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(stateDir, "WebView2"), options);
            StartupLog.Mark("browser engine started");
            await web.EnsureCoreWebView2Async(env);
            StartupLog.Mark("web view ready");
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
            core.NavigationCompleted += (_, _) =>
            {
                StartupLog.Mark("page loaded");
                web.Visible = true;
                status.Visible = false;
            };
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
        if (testProfile) return Path.Combine(stateDir, SaveFileName);

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
            if (cmd == "ready")
            {
                // The page has drawn the app itself: start-up is over.
                if (ready) return;
                ready = true;
                StartupLog.Mark("app ready");
                StartupLog.Save(stateDir);
                if (exitWhenReady) BeginInvoke(Close);
                return;
            }
            if (cmd == "brief")
            {
                // What the reminder should say on each of the coming days, kept for when the app is closed.
                if (text != null) WriteWhole(Path.Combine(stateDir, Reminder.BriefFile), text);
                return;
            }
            string path = SavePath();

            switch (cmd)
            {
                case "info":
                    Reply(new { id, ok = true, path });
                    break;

                case "read":
                    BackupOnce(path);
                    Reply(new { id, ok = true, path, text = File.Exists(path) ? File.ReadAllText(path) : "" });
                    break;

                case "write":
                    if (text == null) throw new InvalidOperationException("Nothing to save.");
                    BackupOnce(path);
                    WriteWhole(path, text);
                    Reply(new { id, ok = true, path });
                    break;

                case "backups":
                {
                    var list = new List<object>();
                    if (Directory.Exists(BackupDir))
                        foreach (string f in Directory.GetFiles(BackupDir, "*.json"))
                            list.Add(new { name = Path.GetFileName(f), size = new FileInfo(f).Length });
                    Reply(new { id, ok = true, path = BackupDir, text = JsonSerializer.Serialize(list) });
                    break;
                }

                case "restore":
                {
                    string name = Path.GetFileName(text ?? "");
                    string from = Path.Combine(BackupDir, name);
                    if (name.Length == 0 || name != text || !name.EndsWith(".json", StringComparison.OrdinalIgnoreCase) || !File.Exists(from))
                        throw new InvalidOperationException("That backup is no longer there.");
                    string restored = File.ReadAllText(from);
                    // The save as it is now is put aside first, so a restore can itself be undone.
                    if (File.Exists(path))
                    {
                        File.Copy(path, Path.Combine(BackupDir, "before-restore-" + DateTime.Now.ToString("yyyy-MM-dd-HHmmss") + ".json"), true);
                        Prune("before-restore-*.json", 5);
                    }
                    WriteWhole(path, restored);
                    Reply(new { id, ok = true, path, text = restored });
                    break;
                }

                case "openBackups":
                    Directory.CreateDirectory(BackupDir);
                    Process.Start(new ProcessStartInfo(BackupDir) { UseShellExecute = true })?.Dispose();
                    Reply(new { id, ok = true, path = BackupDir });
                    break;

                case "reminder":
                    Reply(new { id, ok = true, text = ReminderTime() });
                    break;

                case "setReminder":
                    SetReminder(text ?? "");
                    Reply(new { id, ok = true, text = ReminderTime() });
                    break;

                case "testReminder":
                {
                    var again = new ProcessStartInfo(Environment.ProcessPath) { UseShellExecute = false };
                    again.ArgumentList.Add("--remind");
                    again.ArgumentList.Add("--test");
                    if (testProfile) { again.ArgumentList.Add("--profile"); again.ArgumentList.Add(profile); }
                    Process.Start(again)?.Dispose();
                    Reply(new { id, ok = true });
                    break;
                }

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

    /// <summary>Writes beside the file, then swaps it in, so a crash can never leave half a file.</summary>
    static void WriteWhole(string path, string text)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        string temp = path + ".tmp";
        File.WriteAllText(temp, text, new UTF8Encoding(false));
        File.Move(temp, path, true);
    }

    // ---------- backups ----------
    //
    // Once a day, before the save is first read or changed, a copy of it is put in the Backups
    // folder beside the window settings (not in iCloud Drive, so a bad sync can't reach it).
    // The copy named for a day is the save as it was when that day began.

    const int BackupsKept = 14;
    string BackupDir => Path.Combine(stateDir, "Backups");
    string backedUpOn;

    void BackupOnce(string path)
    {
        string today = DateTime.Now.ToString("yyyy-MM-dd");
        if (backedUpOn == today) return;
        try
        {
            if (!File.Exists(path) || new FileInfo(path).Length == 0) return;
            Directory.CreateDirectory(BackupDir);
            string copy = Path.Combine(BackupDir, "isekai-habits-" + today + ".json");
            if (!File.Exists(copy)) File.Copy(path, copy);
            backedUpOn = today;
            Prune("isekai-habits-????-??-??.json", BackupsKept);
        }
        catch { /* a backup that fails must never stop the save itself */ }
    }

    /// <summary>Keeps the newest files that match; their names sort by date.</summary>
    void Prune(string pattern, int keep)
    {
        string[] files = Directory.GetFiles(BackupDir, pattern);
        Array.Sort(files, StringComparer.Ordinal);
        for (int i = 0; i < files.Length - keep; i++) File.Delete(files[i]);
    }

    // ---------- the evening reminder ----------
    //
    // A task in the Windows Task Scheduler starts this program with "--remind" every day at
    // the chosen time (see Reminder). Nothing has to stay running for it.

    string ReminderFile => Path.Combine(stateDir, "reminder-time.txt");

    /// <summary>The time the reminder is set for, as HH:MM, or "" when it is off.</summary>
    string ReminderTime()
    {
        try
        {
            string time = File.ReadAllText(ReminderFile).Trim();
            if (Regex.IsMatch(time, "^([01][0-9]|2[0-3]):[0-5][0-9]$") && Schtasks(out _, "/Query", "/TN", taskName) == 0) return time;
        }
        catch { /* never set */ }
        return "";
    }

    void SetReminder(string time)
    {
        if (time.Length == 0)
        {
            Schtasks(out _, "/Delete", "/TN", taskName, "/F");
            File.Delete(ReminderFile);
            return;
        }
        if (!Regex.IsMatch(time, "^([01][0-9]|2[0-3]):[0-5][0-9]$")) throw new InvalidOperationException("That is not a time.");

        string arguments = "--remind" + (testProfile ? " --profile \"" + profile + "\"" : "");
        string xml =
            "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\n" +
            "<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\n" +
            "  <RegistrationInfo><Description>Shows a reminder when habits are still open in Isekai Habits. Turn it off in the app's Settings.</Description></RegistrationInfo>\n" +
            "  <Triggers><CalendarTrigger><StartBoundary>2026-01-01T" + time + ":00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>\n" +
            "  <Principals><Principal id=\"Author\"><UserId>" + WindowsIdentity.GetCurrent().User.Value + "</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\n" +
            "  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>false</StartWhenAvailable><ExecutionTimeLimit>PT5M</ExecutionTimeLimit><Enabled>true</Enabled></Settings>\n" +
            "  <Actions Context=\"Author\"><Exec><Command>" + SecurityElement.Escape(Environment.ProcessPath) + "</Command><Arguments>" + SecurityElement.Escape(arguments) + "</Arguments></Exec></Actions>\n" +
            "</Task>\n";
        string temp = Path.Combine(stateDir, "reminder-task.xml");
        File.WriteAllText(temp, xml, Encoding.Unicode);
        int code = Schtasks(out string said, "/Create", "/TN", taskName, "/XML", temp, "/F");
        File.Delete(temp);
        if (code != 0) throw new InvalidOperationException("Windows could not schedule the reminder. " + said);
        File.WriteAllText(ReminderFile, time);
    }

    /// <summary>Runs the Windows task scheduler's own command-line tool and returns its exit code.</summary>
    static int Schtasks(out string said, params string[] arguments)
    {
        var info = new ProcessStartInfo("schtasks.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (string a in arguments) info.ArgumentList.Add(a);
        using var run = Process.Start(info);
        string output = run.StandardOutput.ReadToEnd();
        string error = run.StandardError.ReadToEnd();
        run.WaitForExit(15000);
        said = (error.Trim().Length > 0 ? error : output).Trim();
        return run.HasExited ? run.ExitCode : -1;
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
        StartupLog.Mark("closing");
        SaveBounds();
        Hide();
        try
        {
            await web.CoreWebView2.ExecuteScriptAsync("window.isekaiFlush && window.isekaiFlush()");
            await Task.Delay(600);
        }
        catch { /* page not loaded */ }
        if (wantedAgain)
        {
            // Started again while the last save was being written: simply stay open.
            wantedAgain = false;
            closing = false;
            StartupLog.Mark("started again while closing: staying open");
            Show();
            Activated_();
            return;
        }
        leaving = true;
        try
        {
            // Wait for the browser engine to be gone before this program ends. Left to wind down
            // on its own it lingers, and starting the app again meanwhile takes five seconds.
            var gone = new TaskCompletionSource<bool>();
            web.CoreWebView2.Environment.BrowserProcessExited += (_, _) => gone.TrySetResult(true);
            web.Dispose();
            await Task.WhenAny(gone.Task, Task.Delay(2500));
            StartupLog.Mark(gone.Task.IsCompleted ? "browser engine gone" : "browser engine still there after 2.5 s");
        }
        catch { /* already gone */ }
        StartupLog.Save(stateDir);
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

    /// <summary>The app was started a second time: show this window, or open again if it is on its way out.</summary>
    void Activated_()
    {
        if (closing)
        {
            // Too late to stay open once the page is gone: then it opens afresh after this one has ended.
            if (leaving) ReopenAfterClose = true;
            else wantedAgain = true;
            return;
        }
        ShowWindow(Handle, 9 /* SW_RESTORE */);
        SetForegroundWindow(Handle);
    }

    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
}
