param(
    [string]$TargetExe = 'G:\115-Desktop\115-Desktop.exe',
    [int]$ParentProcessId = 0,
    [int]$DurationSeconds = 0,
    [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Select-MagnetCandidates([string]$Text) {
    if (!$Text -or $Text.Length -gt 32768) { return }
    foreach ($match in [regex]::Matches($Text, 'magnet:\?[^\s<>"''\x00-\x1f]+', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        if ($match.Value.Length -le 10000) { $match.Value }
    }
}
if ($SelfTest) {
    $sample = 'magnet:?xt=urn:btih:' + ('a' * 40)
    if (@(Select-MagnetCandidates $sample).Count -ne 1) { throw 'Magnet extraction failed.' }
    if (@(Select-MagnetCandidates 'ordinary clipboard text').Count -ne 0) { throw 'Non-magnet text was exposed.' }
    if (@(Select-MagnetCandidates ('x' * 32769)).Count -ne 0) { throw 'Clipboard size bound failed.' }
    [Console]::WriteLine('{"kind":"self-test","ok":true}')
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CollectorClipboardNative {
    [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
'@
$expected = [IO.Path]::GetFullPath($TargetExe)
$sequence = [CollectorClipboardNative]::GetClipboardSequenceNumber()
$started = [DateTime]::UtcNow
$nextParentCheck = $started
[Console]::WriteLine('{"kind":"ready"}')
while ($true) {
    if ($DurationSeconds -gt 0 -and ([DateTime]::UtcNow - $started).TotalSeconds -ge $DurationSeconds) { break }
    if ($ParentProcessId -gt 0 -and [DateTime]::UtcNow -ge $nextParentCheck) {
        if (!(Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue)) { break }
        $nextParentCheck = [DateTime]::UtcNow.AddSeconds(1)
    }
    $current = [CollectorClipboardNative]::GetClipboardSequenceNumber()
    if ($current -ne $sequence) {
        [uint32]$foregroundProcessId = 0
        [void][CollectorClipboardNative]::GetWindowThreadProcessId([CollectorClipboardNative]::GetForegroundWindow(), [ref]$foregroundProcessId)
        $source = $null
        $foregroundProcess = $null
        try { $foregroundProcess = [Diagnostics.Process]::GetProcessById([int]$foregroundProcessId); $source = $foregroundProcess.MainModule.FileName } catch { }
        finally { if ($foregroundProcess) { $foregroundProcess.Dispose() } }
        if (![string]::Equals($source, $expected, [StringComparison]::OrdinalIgnoreCase)) { $sequence = $current }
        else {
            try {
                $text = [Windows.Forms.Clipboard]::GetText()
                $sequence = $current
                foreach ($candidate in @(Select-MagnetCandidates $text)) {
                    [Console]::WriteLine((@{ kind = 'magnet'; value = $candidate } | ConvertTo-Json -Compress))
                }
                $text = $null
            } catch [System.Runtime.InteropServices.ExternalException] { }
        }
    }
    Start-Sleep -Milliseconds 100
}
