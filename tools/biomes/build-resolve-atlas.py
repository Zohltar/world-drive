#!/usr/bin/env python3
"""Offline RESOLVE 2017 preprocessor. No network or writes outside --output.
Install build-only dependencies: numpy==2.2.6 rasterio==1.4.3 pyshp==2.3.1
Input is the provider's Ecoregions2017.zip, not an executable downloaded script.
"""
import argparse
import gzip
import hashlib
import json
import math
import re
import shutil
import tempfile
import time
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
import shapefile

SOURCE_URL = "https://storage.googleapis.com/teow2016/Ecoregions2017.zip"
SCHEMA = "world-drive-biome-atlas-v1"
VALID_BIOMES = set(range(1, 15)) | {98}


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def extract_source(archive, directory):
    """Extract named components plus optional codepage, never use ZIP paths."""
    required = {".shp", ".shx", ".dbf", ".prj"}
    extensions = required | {".cpg"}
    found = set()
    with zipfile.ZipFile(archive) as source:
        for info in source.infolist():
            name = Path(info.filename).name
            path = Path(name)
            if path.stem.lower() != "ecoregions2017" or path.suffix.lower() not in extensions:
                continue
            ext = path.suffix.lower()
            if ext in found or info.file_size > (128 if ext == ".cpg" else 400_000_000):
                raise ValueError("Duplicate or oversized shapefile component")
            found.add(ext)
            with source.open(info) as incoming, (directory / ("Ecoregions2017" + ext)).open("wb") as outgoing:
                shutil.copyfileobj(incoming, outgoing)
    if not required.issubset(found):
        raise ValueError("Missing source shapefile components")
    projection = (directory / "Ecoregions2017.prj").read_text()
    if (not any(key in projection for key in ("GEOGCS", "GEOGCRS"))
            or not any(key in projection for key in ("WGS_1984", "WGS 84", "WGS_84"))
            or "PROJCS" in projection or "PROJCRS" in projection):
        raise ValueError("Expected unprojected WGS84 longitude/latitude source")
    return directory / "Ecoregions2017.shp"


def source_encoding(path):
    """Honor CPG first, then supported DBF language-driver metadata; decode strictly.
    GDAL documents CPG/LDID precedence and LDID 0x57 as ISO-8859-1.
    Unknown nonzero drivers fail closed; absent metadata requires valid UTF-8.
    """
    with path.with_suffix(".dbf").open("rb") as stream:
        header = stream.read(32)
    if len(header) != 32:
        raise ValueError("Truncated DBF header")
    ldid = header[29]
    cpg = path.with_suffix(".cpg")
    if cpg.exists():
        value = cpg.read_text(encoding="utf-8-sig").strip()
        normalized = re.sub(r"[^a-z0-9]", "", value.lower())
        known = {"utf8": "utf-8", "65001": "utf-8", "1252": "cp1252",
                 "windows1252": "cp1252", "cp1252": "cp1252",
                 "iso88591": "latin1", "88591": "latin1", "latin1": "latin1"}
        if normalized not in known:
            raise ValueError(f"Unsupported source CPG: {value!r}")
        return dict(encoding=known[normalized], authority="cpg", cpg=value, ldid=ldid)
    if ldid not in (0, 0x03, 0x57):
        raise ValueError(f"Unsupported DBF language driver: {ldid:#x}")
    return dict(encoding={0: "utf-8", 0x03: "cp1252", 0x57: "latin1"}[ldid],
                authority="dbf-ldid" if ldid else "strict-utf8-without-metadata",
                cpg=None, ldid=ldid)


def build(archive, output, cell_degrees, expected_sha256=None):
    if cell_degrees not in (0.1, 0.05):
        raise ValueError("Prototype permits only 0.1 or 0.05 degrees")
    if archive.stat().st_size > 200_000_000:
        raise ValueError("Source ZIP exceeds the prototype size bound")
    digest = sha256(archive)
    if expected_sha256 is not None and digest != expected_sha256:
        raise ValueError("Source SHA-256 mismatch; do not silently change datasets")
    start = time.perf_counter()
    width, height = round(360 / cell_degrees), round(180 / cell_degrees)
    cells = np.zeros((height, width), dtype=np.uint16)
    with tempfile.TemporaryDirectory() as temporary:
        path = extract_source(archive, Path(temporary))
        text_encoding = source_encoding(path)
        print(json.dumps({"sourceTextEncoding": text_encoding}), flush=True)
        with shapefile.Reader(str(path), encoding=text_encoding["encoding"], encodingErrors="strict") as reader:
            indexed = []
            catalog = {}
            for index, record in enumerate(reader.iterRecords()):
                fields = record.as_dict()
                if re.sub(r"[^a-z0-9]", "", str(fields.get("LICENSE", "")).lower()) != "ccby40":
                    raise ValueError("Source feature lacks the expected CC-BY-4.0 license")
                eco_id, biome = fields["ECO_ID"], fields["BIOME_NUM"]
                if not isinstance(eco_id, (int, float)) or eco_id != int(eco_id) or eco_id < 0:
                    raise ValueError("Invalid ECO_ID")
                if not isinstance(biome, (int, float)) or biome != int(biome) or biome not in VALID_BIOMES:
                    raise ValueError("Unsupported source biome")
                item = dict(id=int(eco_id), biome=int(biome), name=str(fields["ECO_NAME"]), realm=str(fields["REALM"]))
                if eco_id in catalog and catalog[eco_id] != item:
                    raise ValueError("Split ecoregion metadata disagrees")
                catalog[eco_id] = item
                indexed.append((int(eco_id), index))
            records = [None] + [catalog[key] for key in sorted(catalog)]
            if not 2 <= len(records) <= 4096:
                raise ValueError("Source feature count outside prototype bound")
            slot_by_id = {record["id"]: slot for slot, record in enumerate(records) if record}
            # Stable ECO_ID order; overlapping source polygons resolve to the last id.
            for eco_id, index in sorted(indexed):
                shape = reader.shape(index)
                if shape.shapeType not in (5, 15, 25):
                    raise ValueError("Expected polygon geometry")
                xmin, ymin, xmax, ymax = shape.bbox
                if not all(math.isfinite(v) for v in shape.bbox):
                    raise ValueError("Non-finite geometry bounds")
                if xmin < -180.001 or xmax > 180.001 or ymin < -90.001 or ymax > 90.001:
                    raise ValueError("Geometry outside WGS84 bounds")
                c0 = max(0, min(width, math.floor((xmin + 180) / cell_degrees)))
                c1 = max(0, min(width, math.ceil((xmax + 180) / cell_degrees)))
                r0 = max(0, min(height, math.floor((90 - ymax) / cell_degrees)))
                r1 = max(0, min(height, math.ceil((90 - ymin) / cell_degrees)))
                if c1 <= c0 or r1 <= r0:
                    continue
                block = cells[r0:r1, c0:c1].copy()
                rasterize([(shape.__geo_interface__, slot_by_id[eco_id])], out=block,
                          transform=from_origin(-180 + c0 * cell_degrees, 90 - r0 * cell_degrees,
                                                cell_degrees, cell_degrees),
                          all_touched=False, dtype="uint16", skip_invalid=False)
                cells[r0:r1, c0:c1] = block
    output.mkdir(parents=True, exist_ok=True)
    raw = cells.astype("<u2", copy=False).tobytes()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    (output / "cells.u16le.gz").write_bytes(packed)
    manifest = dict(schema=SCHEMA, crs="EPSG:4326", west=-180, north=90,
                    width=width, height=height, cellDegrees=360 / width,
                    records=records, source=dict(id="RESOLVE-ECOREGIONS-2017", license="CC-BY-4.0",
                    sha256=digest, url=SOURCE_URL, textEncoding=text_encoding, citation="Dinerstein et al. (2017), doi:10.1093/biosci/bix014"),
                    encoding="uint16-little-endian-gzip", cellSha256=hashlib.sha256(raw).hexdigest(),
                    modifications="Cell-center rasterization; record slots sorted by ECO_ID; 0 means no data")
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    metrics = dict(sourceTextEncoding=text_encoding, sourceSha256=digest, sourceZipBytes=archive.stat().st_size,
                   sourceRecords=len(records) - 1, cellDegrees=cell_degrees,
                   rawBytes=len(raw), gzipBytes=len(packed), manifestBytes=(output / "manifest.json").stat().st_size,
                   assignedCells=int(np.count_nonzero(cells)), totalCells=width * height,
                   buildSeconds=time.perf_counter() - start, numpy=np.__version__, rasterio=rasterio.__version__,
                   pyshp=shapefile.__version__)
    (output / "build-metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    (output / "ATTRIBUTION.txt").write_text(
        "RESOLVE Ecoregions 2017, Dinerstein et al. (2017). CC-BY-4.0.\n"
        "https://doi.org/10.1093/biosci/bix014\nhttps://creativecommons.org/licenses/by/4.0/\n"
        f"Source: {SOURCE_URL}\nSource SHA-256: {digest}\n"
        f"Modified for World Drive: {cell_degrees} degree cell-center raster; no-data retained.\n"
        "Regional ecosystem context only; not current land cover, treeline or placement permission.\n")
    print(json.dumps(metrics, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cell-degrees", type=float, choices=[0.1, 0.05], default=0.1)
    parser.add_argument("--expected-sha256", default=None)
    args = parser.parse_args()
    build(args.input, args.output, args.cell_degrees, args.expected_sha256)
