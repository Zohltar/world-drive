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
    'V21.12 alpha · initialisation du monde' = 'V21.13 alpha · initialisation du monde'
    'World Drive V21.12' = 'World Drive V21.13'
    'V21.11 alpha · initialisation du monde' = 'V21.13 alpha · initialisation du monde'
    'World Drive V21.11' = 'World Drive V21.13'
}

Update-TextFile 'index.html' @{
    'V21.12' = 'V21.13'
    'V21.11' = 'V21.13'
    'V21.10' = 'V21.13'
    'V20.13 · stable' = 'V21.13 · alpha'
}

Write-Host 'Version visible mise a jour vers V21.13.' -ForegroundColor Green
