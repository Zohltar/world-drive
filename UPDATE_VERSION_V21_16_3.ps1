# World Drive V21.16.3 - safe visible-version updater
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$files = @('index.html','src/main.js')
foreach ($file in $files) {
    if (-not (Test-Path $file)) { continue }
    $text = [System.IO.File]::ReadAllText((Resolve-Path $file), $utf8)
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.16(?:\.\d+)?', 'V21.16.3')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $text, $utf8)
}
Write-Host 'World Drive visible version -> V21.16.3'
