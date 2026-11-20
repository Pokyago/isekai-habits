@echo off
rem Rebuilds "Isekai Habits.exe" in the project folder. Needs the .NET 8 SDK. Close the app first.
rem Only needed after changing desktop\Program.cs; changes to the app itself only need "npm run build".
setlocal
cd /d "%~dp0"
dotnet publish IsekaiHabits.csproj -c Release -o "%~dp0out" --nologo -v quiet
if errorlevel 1 (
  echo.
  echo Build failed.
  exit /b 1
)
copy /y "%~dp0out\Isekai Habits.exe" "%~dp0..\Isekai Habits.exe" >nul
if errorlevel 1 (
  echo Could not replace "Isekai Habits.exe" - is the app still open?
  exit /b 1
)
rmdir /s /q "%~dp0out" "%~dp0bin" "%~dp0obj" 2>nul
echo Built "Isekai Habits.exe".
