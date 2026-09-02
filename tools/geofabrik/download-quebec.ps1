param(
  [string]$Destination = ".\world-data\source\quebec-latest.osm.pbf"
)

$ErrorActionPreference = "Stop"
$Url = "https://download.geofabrik.de/north-america/canada/quebec-latest.osm.pbf"
$Md5Url = "$Url.md5"
$Destination = [System.IO.Path]::GetFullPath($Destination)
$Directory = Split-Path -Parent $Destination
$Md5File = "$Destination.md5"

New-Item -ItemType Directory -Force -Path $Directory | Out-Null

Write-Host "Downloading Quebec OSM PBF from Geofabrik..."
if (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue) {
  Start-BitsTransfer -Source $Url -Destination $Destination
  Start-BitsTransfer -Source $Md5Url -Destination $Md5File
} else {
  Invoke-WebRequest -Uri $Url -OutFile $Destination
  Invoke-WebRequest -Uri $Md5Url -OutFile $Md5File
}

$Expected = ((Get-Content $Md5File -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$Actual = (Get-FileHash -Path $Destination -Algorithm MD5).Hash.ToLowerInvariant()

if ($Expected -ne $Actual) {
  throw "MD5 mismatch. Expected $Expected but got $Actual"
}

Write-Host "Verified: $Destination"
Write-Host "MD5: $Actual"
Write-Host "Next: ensure 'osmium --version' works, then run:"
Write-Host "node tools/geofabrik/build-world-tiles.mjs --pbf `"$Destination`" --region quebec --out public/world-data/osm/quebec --overwrite"
