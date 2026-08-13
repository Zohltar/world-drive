$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$files = @('index.html', 'src/main.js')
foreach ($file in $files) {
    if (-not (Test-Path $file)) { continue }
    $text = [System.IO.File]::ReadAllText((Resolve-Path $file), $utf8)
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.[0-9]+(?:\.[0-9]+)?', 'V21.15.2')
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V20\.13', 'V21.15.2')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $text, $utf8)
}
Write-Host 'World Drive visible version updated to V21.15.2'
