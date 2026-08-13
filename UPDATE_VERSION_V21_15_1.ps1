$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$targets = @(
    (Join-Path $root 'index.html'),
    (Join-Path $root 'src\main.js'),
    (Join-Path $root 'src\terrain.js')
)
foreach ($path in $targets) {
    if (-not (Test-Path $path)) { continue }
    $text = [System.IO.File]::ReadAllText($path, $utf8)
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.15(?!\.1)', 'V21.15.1')
    [System.IO.File]::WriteAllText($path, $text, $utf8)
}
Write-Host 'World Drive visible version updated to V21.15.1' -ForegroundColor Green
