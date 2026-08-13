$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Update-TextFile([string]$Path, [hashtable]$Replacements) {
    if (-not (Test-Path $Path)) { return }
    $text = [System.IO.File]::ReadAllText($Path)
    foreach ($key in $Replacements.Keys) {
        $text = $text.Replace($key, $Replacements[$key])
    }
    [System.IO.File]::WriteAllText($Path, $text, $utf8)
}

Update-TextFile 'src/main.js' @{
    'V21.13 alpha · initialisation du monde' = 'V21.14 alpha · initialisation du monde'
    'World Drive V21.13' = 'World Drive V21.14'
    'V21.13 ALPHA' = 'V21.14 ALPHA'
    'V21.11 ALPHA' = 'V21.14 ALPHA'
}

Update-TextFile 'index.html' @{
    'V21.13' = 'V21.14'
    'V21.12' = 'V21.14'
    'V21.11' = 'V21.14'
    'V20.13 · stable' = 'V21.14 · alpha'
}

Update-TextFile 'package.json' @{
    '"version": "21.13.0"' = '"version": "21.14.0"'
    '"version": "21.12.1"' = '"version": "21.14.0"'
    '"version": "21.12.0"' = '"version": "21.14.0"'
}

Write-Host 'Version visible mise a jour vers V21.14.' -ForegroundColor Green
