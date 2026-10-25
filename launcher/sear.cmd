@echo off
setlocal
rem The `sear` command for cmd and PowerShell; launcher/sear is the same for Git Bash.
rem Claude Code with the sear channel, in the current directory (`sear learn ...`: in the Handhold root, for lessons);
rem the helper accepts the dev-channels dialog. A lesson's restart (bridge/lesson.mts) leaves the marker and ends
rem claude, and the loop starts a fresh one.
set "marker=%USERPROFILE%\Sear\restart"
set "args="
if /i "%~1"=="learn" (
  cd /d "%USERPROFILE%\Learning" || exit /b 1
  shift /1
)
rem `shift` doesn't change %*, so the arguments are collected one by one.
:collect
if "%~1"=="" goto run
set args=%args% %1
shift /1
goto collect
:run
del "%marker%" 2>nul
rem SEAR_CHANNEL tells /sear and /learn the channel is loaded, so site messages can reach this session.
set SEAR_CHANNEL=1
:loop
start "" /b powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0accept-dev-channels.ps1" plugin:sear@sear <nul
claude --dangerously-load-development-channels plugin:sear@sear%args%
if not exist "%marker%" exit /b %errorlevel%
del "%marker%"
rem The fresh session takes no arguments: the queued start tells it what to run. Clearing also stops the helper
rem matching the last launch's dialog.
set "args="
cls
goto loop
