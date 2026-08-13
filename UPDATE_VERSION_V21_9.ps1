$path = Join-Path (Get-Location) "index.html"

if (!(Test-Path $path)) {
    throw "index.html introuvable dans le dossier courant."
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)

# Robust against prior V21 test builds and the V20.13 stable label.
$text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.[0-8]', 'V21.9')
$text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V20\.13', 'V21.9')

[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Host "Version UI mise a jour vers V21.9 alpha."
