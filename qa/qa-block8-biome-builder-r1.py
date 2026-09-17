"""Small synthetic polygon/hole fixture tests for the offline converter."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import zipfile

import numpy as np
import shapefile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "tools/biomes/build-resolve-atlas.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    base = root / "Ecoregions2017"
    with shapefile.Writer(str(base), shapeType=shapefile.POLYGON) as writer:
        writer.field("ECO_ID", "N"); writer.field("BIOME_NUM", "N")
        writer.field("ECO_NAME", "C"); writer.field("REALM", "C"); writer.field("LICENSE", "C")
        # Clockwise outer ring, anticlockwise hole. Hole must remain zero.
        writer.poly([[[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]],
                     [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]])
        writer.record(101, 1, "Synthetic tropical", "test", "CC-BY 4.0")
        writer.poly([[[10, 0], [10, 4], [14, 4], [14, 0], [10, 0]]])
        writer.record(102, 13, "Synthetic desert", "test", "CC-BY 4.0")
    base.with_suffix(".prj").write_text('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]')
    archive = root / "source.zip"
    with zipfile.ZipFile(archive, "w") as output:
        for ext in (".shp", ".shx", ".dbf", ".prj"):
            output.write(base.with_suffix(ext), "nested/" + base.name + ext)
        output.writestr("../../escape.txt", "must never extract")
    digest = builder.sha256(archive)
    for name in ("first", "second"):
        builder.build(archive, root / name, 0.1, digest)
    first, second = root / "first", root / "second"
    assert (first / "cells.u16le.gz").read_bytes() == (second / "cells.u16le.gz").read_bytes()
    assert (first / "manifest.json").read_bytes() == (second / "manifest.json").read_bytes()
    raw = gzip.decompress((first / "cells.u16le.gz").read_bytes())
    manifest = json.loads((first / "manifest.json").read_text())
    cells = np.frombuffer(raw, dtype="<u2").reshape(1800, 3600)
    def sample(lat, lon):
        return int(cells[int((90-lat)*10), int((lon+180)*10)])
    assert sample(0.55, 0.55) == 1
    assert sample(2.05, 2.05) == 0
    assert sample(0.55, 10.55) == 2
    assert sample(-10, -10) == 0
    assert hashlib.sha256(raw).hexdigest() == manifest["cellSha256"]
    assert manifest["source"]["sha256"] == digest
    try:
        builder.build(archive, root / "wrong", 0.1, "0" * 64)
        raise AssertionError("Expected source hash rejection")
    except ValueError as error:
        assert "SHA-256" in str(error)
    assert not (root / "escape.txt").exists()
print("Block 8 builder: polygon, hole, no-data, little-endian, reproducibility and hash checks PASS")
