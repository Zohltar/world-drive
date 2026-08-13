$path = Join-Path (Get-Location) "index.html"

if (!(Test-Path $path)) {
    throw "index.html introuvable dans le dossier courant."
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)

# Titre du navigateur
$text = [System.Text.RegularExpressions.Regex]::Replace(
    $text,
    '<title>.*?</title>',
    '<title>World Drive V21.0</title>',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

# Marque dans l'ancien HUD (désormais masqué par l'interface V21)
$text = [System.Text.RegularExpressions.Regex]::Replace(
    $text,
    '<div id="brand">.*?</div>',
    '<div id="brand"><b>V21.0</b> WORLD DRIVE</div>',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

# Libellé de version sous le statut
$text = [System.Text.RegularExpressions.Regex]::Replace(
    $text,
    '<div style="font-size:10px;color:#8fa6bf;margin-top:4px">.*?</div>',
    '<div style="font-size:10px;color:#8fa6bf;margin-top:4px">V21.0 alpha · nouvelle interface</div>',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

# Titre de l'ancien overlay de chargement
$text = [System.Text.RegularExpressions.Regex]::Replace(
    $text,
    '(<div id="loading"><div class="box"><div class="spin"></div><h1>).*?(</h1>)',
    '$1World Drive V21.0$2',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

[System.IO.File]::WriteAllText($path, $text, $utf8)

Write-Host "Version UI mise a jour vers V21.0 alpha."
