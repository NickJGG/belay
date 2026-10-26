# Raises the Windows Terminal tab of a Claude Code session and selects it; the bridge's `focus` message runs it.
# First it attaches to the console of $ClaudePid and sets a unique title, which WT shows on that tab only. If that
# fails, it matches the session title from $Transcript (trimmed from ~/.claude/notify.ps1). On a miss it prints why,
# for the site's toast.
param([int]$ClaudePid, [string]$Transcript)

function Get-SessionTitle([string]$path) {
    $title = $null
    foreach ($m in (Select-String -Path $path -Pattern '"type":"(ai|custom)-title"' -Encoding UTF8)) {
        try { $e = $m.Line | ConvertFrom-Json } catch { continue }
        if ($e.type -eq "custom-title" -and $e.customTitle) { $title = $e.customTitle; $custom = $true }
        elseif (-not $custom -and $e.aiTitle) { $title = $e.aiTitle }
    }
    return $title
}

function Initialize-Win32 {
    if ('Win32.User32' -as [type]) { return }
    Add-Type -Namespace Win32 -Name User32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
[DllImport("kernel32.dll")] public static extern bool FreeConsole();
[DllImport("kernel32.dll")] public static extern bool AttachConsole(int pid);
[DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern bool SetConsoleTitle(string title);
[DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern int GetConsoleTitle(System.Text.StringBuilder title, int size);
'@
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
}

# Every tab across all Windows Terminal windows that $match accepts, with its window.
function Find-Tabs([scriptblock]$match) {
    $winCond = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ClassNameProperty, "CASCADIA_HOSTING_WINDOW_CLASS")
    $tabCond = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::TabItem)
    $found = @()
    foreach ($w in [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, $winCond)) {
        foreach ($t in $w.FindAll([Windows.Automation.TreeScope]::Descendants, $tabCond)) {
            if (& $match $t.Current.Name) { $found += , @($w, $t) }
        }
    }
    return , $found
}

function Show-Tab($window, $tab) {
    $hwnd = [IntPtr]$window.Current.NativeWindowHandle
    if ([Win32.User32]::IsIconic($hwnd)) { [Win32.User32]::ShowWindow($hwnd, 9) | Out-Null }
    # Windows refuses SetForegroundWindow from background processes unless a key event just happened.
    [Win32.User32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [Win32.User32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [Win32.User32]::SetForegroundWindow($hwnd) | Out-Null
    $tab.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Select()
}

# The tab whose console is $ClaudePid's, by a marker title; null if it can't attach or the marker never shows.
function Find-ByMarker {
    if (-not $ClaudePid) { return $null }
    [Win32.User32]::FreeConsole() | Out-Null
    if (-not [Win32.User32]::AttachConsole($ClaudePid)) { return $null }
    $old = New-Object System.Text.StringBuilder 1024
    [Win32.User32]::GetConsoleTitle($old, $old.Capacity) | Out-Null
    $marker = "belay-focus-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
    $found = $null
    try {
        # A busy Claude Code rewrites its title as its spinner turns, so set the marker again before each look.
        for ($i = 0; $i -lt 20 -and -not $found; $i++) {
            [Win32.User32]::SetConsoleTitle($marker) | Out-Null
            Start-Sleep -Milliseconds 50
            $tabs = Find-Tabs { param($n) $n -eq $marker }
            if ($tabs.Count -eq 1) { $found = $tabs[0] }
        }
    } finally {
        [Win32.User32]::SetConsoleTitle($old.ToString()) | Out-Null
        [Win32.User32]::FreeConsole() | Out-Null
    }
    return $found
}

[Console]::OutputEncoding = [Text.Encoding]::UTF8
Initialize-Win32
$hit = Find-ByMarker
if ($hit) { Show-Tab $hit[0] $hit[1]; exit 0 }

$title = if ($Transcript -and (Test-Path $Transcript)) { Get-SessionTitle $Transcript }
if (-not $title) { "The session has no title yet."; exit 2 }
$found = Find-Tabs { param($n) $n -eq $title -or $n.EndsWith(" $title") }
if ($found.Count -eq 0) { "No terminal tab is titled `"$title`"."; exit 3 }
if ($found.Count -gt 1) { "$($found.Count) terminal tabs are titled `"$title`": /rename one."; exit 4 }
Show-Tab $found[0][0] $found[0][1]
exit 0
