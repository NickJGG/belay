@echo off
setlocal
rem The `sear` command for cmd and PowerShell; launcher/sear is the same for Git Bash.
rem Claude Code with the sear channel, in the current directory; the helper accepts the dev-channels dialog.
start "" /b powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0accept-dev-channels.ps1" plugin:sear@sear <nul
rem SEAR_CHANNEL tells /sear the channel is loaded, so site messages can reach this session.
set SEAR_CHANNEL=1
claude --dangerously-load-development-channels plugin:sear@sear %*
