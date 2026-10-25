# Answers Claude Code's "Loading development channels" dialog (no setting skips it:
# anthropics/claude-code#42486). Started by a launcher in the same console just before claude, it presses
# Enter only once the dialog is on screen, its Channels line lists exactly -Channels (any order) and
# option 1 is selected; after 20 s it gives up. Anything it prints would land on claude's screen, so it
# stays silent. Needs a real Windows console: under mintty it finds no dialog and times out.
param([Parameter(Mandatory = $true)][string[]]$Channels)
$ErrorActionPreference = "Stop"
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DevChannelsConsole {
  [StructLayout(LayoutKind.Sequential)] struct Coord { public short X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct Rect { public short Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct BufferInfo { public Coord Size, Cursor; public ushort Attr; public Rect Window; public Coord Max; }
  [StructLayout(LayoutKind.Explicit, Size = 20)] struct KeyRecord {
    [FieldOffset(0)] public ushort EventType;
    [FieldOffset(4)] public int KeyDown;
    [FieldOffset(8)] public ushort Repeat;
    [FieldOffset(10)] public ushort VKey;
    [FieldOffset(12)] public ushort Scan;
    [FieldOffset(14)] public char Char;
    [FieldOffset(16)] public uint Control;
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sa, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll")] static extern bool GetConsoleScreenBufferInfo(IntPtr h, out BufferInfo info);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  static extern bool ReadConsoleOutputCharacterW(IntPtr h, StringBuilder buf, uint length, Coord at, out uint read);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  static extern bool WriteConsoleInputW(IntPtr h, KeyRecord[] records, uint count, out uint written);

  // CONIN$/CONOUT$ rather than std handles: the launchers start this with stdin redirected.
  static IntPtr Open(string name) {
    IntPtr h = CreateFileW(name, 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (h == new IntPtr(-1)) throw new Exception("cannot open " + name);
    return h;
  }

  public static string[] Screen() {
    IntPtr h = Open("CONOUT$");
    BufferInfo info;
    if (!GetConsoleScreenBufferInfo(h, out info)) return new string[0];
    int width = info.Size.X, rows = info.Window.Bottom - info.Window.Top + 1;
    var buf = new StringBuilder(width * rows);
    uint read;
    Coord at = new Coord { X = 0, Y = info.Window.Top };
    if (!ReadConsoleOutputCharacterW(h, buf, (uint)(width * rows), at, out read)) return new string[0];
    string text = buf.ToString();
    var lines = new string[rows];
    for (int i = 0; i < rows; i++) lines[i] = text.Substring(i * width, Math.Min(width, Math.Max(0, text.Length - i * width))).TrimEnd();
    return lines;
  }

  public static void Enter() {
    var records = new KeyRecord[2];
    for (int i = 0; i < 2; i++) {
      records[i] = new KeyRecord { EventType = 1, KeyDown = i == 0 ? 1 : 0, Repeat = 1, VKey = 0x0D, Scan = 0x1C, Char = '\r' };
    }
    uint written;
    WriteConsoleInputW(Open("CONIN$"), records, 2, out written);
  }
}
"@

  $expected = ($Channels | Sort-Object -Unique) -join " "
  $pointer = [char]0x276F
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    $screen = [DevChannelsConsole]::Screen()
    $warning = $screen | Where-Object { $_ -match "WARNING: Loading development channels" }
    $channelLines = @($screen | Where-Object { $_ -match "^\s*Channels:" })
    $selected = $screen | Where-Object { $_ -match "^\s*$pointer\s*1\.\s*I am using this for local development\s*$" }
    if ($warning -and $channelLines.Count -eq 1 -and $selected) {
      $listed = (($channelLines[0] -replace "^\s*Channels:", "").Trim() -split "[\s,]+" | Where-Object { $_ } | Sort-Object -Unique) -join " "
      if ($listed -ceq $expected) {
        [DevChannelsConsole]::Enter()
        exit 0
      }
    }
    Start-Sleep -Milliseconds 250
  }
} catch {}
exit 1
