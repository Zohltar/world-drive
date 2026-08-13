$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$files = @('index.html', 'src/main.js')
foreach ($file in $files) {
    if (-not (Test-Path $file)) { continue }
    $text = [System.IO.File]::ReadAllText((Resolve-Path $file), $utf8)
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.15\.2', 'V21.16')
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.15\.1', 'V21.16')
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.15', 'V21.16')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $text, $utf8)
}

Write-Host 'Version visible mise a jour vers V21.16.'
