$path = Join-Path (Get-Location) "index.html"

if (!(Test-Path $path)) {
    throw "index.html introuvable dans le dossier courant."
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)

# Robust against any V21 test build that may still be displayed in index.html.
$text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V21\.[0-6]', 'V21.7')
$text = [System.Text.RegularExpressions.Regex]::Replace($text, 'V20\.13', 'V21.7')

[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Host "Version UI mise a jour vers V21.7 alpha."
