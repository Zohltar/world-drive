$path = Join-Path (Get-Location) "index.html"

if (!(Test-Path $path)) {
    throw "index.html introuvable dans le dossier courant."
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)

$text = $text.Replace("V19.3", "V20.0")

# Fallback for any older V19.x still visible in the UI.
$text = [regex]::Replace(
    $text,
    'V19(?:\.\d+)?(?=\s+WORLD DRIVE)',
    'V20.0'
)

$text = [regex]::Replace(
    $text,
    'V19(?:\.\d+)?\s+alpha(?=\s*·?\s*multijoueur LAN)',
    'V20.0 alpha'
)

[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Host "Version UI mise a jour vers V20.0."
