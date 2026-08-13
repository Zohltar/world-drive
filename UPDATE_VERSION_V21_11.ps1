$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$files = @('index.html', 'src/main.js')
foreach ($file in $files) {
    if (-not (Test-Path $file)) { continue }
    $text = [System.IO.File]::ReadAllText((Resolve-Path $file), [System.Text.Encoding]::UTF8)
    $text = $text.Replace('V21.10', 'V21.11')
    $text = $text.Replace('V21.9', 'V21.11')
    [System.IO.File]::WriteAllText((Resolve-Path $file), $text, $utf8)
}

Write-Host 'World Drive version updated to V21.11'
