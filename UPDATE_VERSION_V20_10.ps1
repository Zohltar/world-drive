$path = Join-Path (Get-Location) "index.html"
if (!(Test-Path $path)) { throw "index.html introuvable dans le dossier courant." }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $utf8)

$text = $text.Replace("V20.9", "V20.10")
$text = $text.Replace("V20.8", "V20.10")
$text = $text.Replace("V20.7", "V20.10")
$text = $text.Replace("V20.6", "V20.10")
$text = $text.Replace("V20.5", "V20.10")
$text = $text.Replace("V20.4", "V20.10")
$text = $text.Replace("V20.3", "V20.10")
$text = $text.Replace("V20.2", "V20.10")
$text = $text.Replace("V20.1", "V20.10")
$text = $text.Replace("V20.0", "V20.10")

[System.IO.File]::WriteAllText($path, $text, $utf8)
Write-Host "Version UI mise a jour vers V20.10."
