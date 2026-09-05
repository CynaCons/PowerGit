# Capture the running PowerGit window (dev or packaged) to a PNG, even when
# it is behind other windows. Part of the "look at it" step in AGENTS.md
# "How we verify" and the release preflight; the state checklist lives in
# docs/agents/memories/visual-walkthrough.md.
#
#   pwsh scripts/capture-window.ps1 -Out captures/selected-row.png
#   pwsh scripts/capture-window.ps1 -Out captures/dark.png -Crop 300,100,700,300
#
# -Crop x,y,w,h cuts a region (window coordinates) and scales it 2x, which is
# what a reviewer needs to judge a single row or node.
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$ProcessName = "powergit",
  [string]$Crop
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class PgWin {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  public struct Rect { public int Left, Top, Right, Bottom; }
}
"@
$proc = Get-Process $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Error "no window for process '$ProcessName' (is the app running?)" }
$h = $proc.MainWindowHandle
$r = New-Object PgWin+Rect
[void][PgWin]::GetWindowRect($h, [ref]$r)
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
# PW_RENDERFULLCONTENT (2): includes the WebView2/DirectComposition surface.
[void][PgWin]::PrintWindow($h, $dc, 2)
$g.ReleaseHdc($dc); $g.Dispose()
$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
# -Crop arrives as one "x,y,w,h" string when invoked with -File from a shell.
$box = if ($Crop) { @($Crop -split "[, ]+" | Where-Object { $_ -ne "" } | ForEach-Object { [int]$_ }) } else { @() }
if ($box.Count -eq 4) {
  $src = New-Object System.Drawing.Rectangle $box[0], $box[1], $box[2], $box[3]
  $zoomed = New-Object System.Drawing.Bitmap ($box[2] * 2), ($box[3] * 2)
  $g2 = [System.Drawing.Graphics]::FromImage($zoomed)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g2.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $zoomed.Width, $zoomed.Height), $src, [System.Drawing.GraphicsUnit]::Pixel)
  $g2.Dispose(); $zoomed.Save($Out); $zoomed.Dispose()
} else {
  $bmp.Save($Out)
}
$bmp.Dispose()
"saved $Out (${w}x${ht}, '$($proc.MainWindowTitle)')"
