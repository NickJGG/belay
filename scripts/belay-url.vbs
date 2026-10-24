' Windows handler for the status line's belay://done/<ID> links: runs `belay set <ID> done` without a window.
' Register it once (per user):
'   reg add HKCU\Software\Classes\belay /ve /d "URL:belay" /f
'   reg add HKCU\Software\Classes\belay /v "URL Protocol" /d "" /f
'   reg add HKCU\Software\Classes\belay\shell\open\command /ve /d "wscript.exe //B //Nologo \"<this file>\" \"%1\"" /f
' Any page or link can launch a belay:// URL, so only this exact shape reaches the command line.
Set re = New RegExp
re.Pattern = "^belay://done/([A-Za-z]{3,4}-[0-9]+)/?$"
If WScript.Arguments.Count = 1 Then
  Set m = re.Execute(WScript.Arguments(0))
  If m.Count = 1 Then
    Set fso = CreateObject("Scripting.FileSystemObject")
    cli = fso.BuildPath(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)), "src\cli.ts")
    CreateObject("WScript.Shell").Run "node """ & cli & """ set " & m(0).SubMatches(0) & " done", 0, False
  End If
End If
