$path = Join-Path (Get-Location) "index.html"

if (!(Test-Path $path)) {
    throw "index.html introuvable dans le dossier courant."
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)

$old = "V19.1 alpha · multijoueur LAN"
$new = "V20.13 · stable"

if ($text.Contains($old)) {
    $text = $text.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $text, $utf8)
    Write-Host "Version UI mise a jour: $new"
} elseif ($text.Contains("V20.13")) {
    Write-Host "La version V20.13 est deja affichee dans index.html."
} else {
    throw "Le libelle de version attendu n'a pas ete trouve. Aucun changement effectue."
}
