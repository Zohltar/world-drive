$path = Join-Path (Get-Location) "index.html"

if (!(Test-Path $path)) {
    throw "index.html introuvable dans le dossier courant."
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)

# Cherche un libelle de version autour de "multijoueur LAN",
# peu importe les espaces, le point milieu ou certaines balises HTML.
$pattern = 'V\d+(?:\.\d+)*(?:\s*alpha)?(?:\s*(?:·|&middot;|&#183;|-)\s*)?multijoueur\s+LAN'

if ([System.Text.RegularExpressions.Regex]::IsMatch(
    $text,
    $pattern,
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)) {
    $text = [System.Text.RegularExpressions.Regex]::Replace(
        $text,
        $pattern,
        'V20.13 · stable',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    [System.IO.File]::WriteAllText($path, $text, $utf8)
    Write-Host "Version UI mise a jour vers: V20.13 · stable"
}
elseif ($text -match 'V20\.13') {
    Write-Host "V20.13 est deja present dans index.html."
}
else {
    Write-Host "Aucun libelle standard trouve."
    Write-Host "Lignes contenant 'version', 'alpha' ou 'multijoueur' :"
    $lines = $text -split "`r?`n"
    $matches = $lines | Where-Object {
        $_ -match '(?i)version|alpha|multijoueur'
    }

    if ($matches.Count -gt 0) {
        $matches | ForEach-Object {
            Write-Host "  $_"
        }
    } else {
        Write-Host "  Aucune ligne correspondante trouvee."
    }

    throw "Version non modifiee. Copie-moi les lignes affichees ci-dessus."
}
