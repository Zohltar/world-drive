#!/usr/bin/env python3
"""Package compatible local refinement outputs into fixed-source one-degree pages.
No network. No polygon edits. Refuses conflicting/unchecked inputs and existing output.
Python standard library only. gzip files are copied exactly, not recompressed.
"""
import argparse
import gzip
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path

MAX_TILE = 2 * 1024 * 1024
SCHEMA = "world-drive-biome-refinement-v1"

def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

def digest(value):
    return hashlib.sha256(value).hexdigest()

def build(inputs, output, revision):
    if not inputs or len(inputs) > 256 or not re.fullmatch(r"[-a-zA-Z0-9_.]{1,80}", revision):
        raise ValueError("Bounded inputs and explicit revision required")
    if output.exists():
        raise ValueError("Output must not exist")
    root = None
    tiles = {}
    for directory in inputs:
        manifest_path = directory / "manifest.json"
        if manifest_path.stat().st_size > 2 * 1024 * 1024:
            raise ValueError("Manifest size limit")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        records = manifest.get("records")
        if manifest.get("schema") != SCHEMA or not isinstance(records, list) or len(records) > 4096:
            raise ValueError("Invalid manifest schema/catalog")
        records = [None if r is None else {k:r[k] for k in ("id","biome","name","realm")} for r in records]
        identity = {"source":{k:manifest["source"][k] for k in ("id","license","sha256")},
                    "records":records, "catalogSha256":manifest["catalogSha256"]}
        if digest(encoded(records)) != identity["catalogSha256"]:
            raise ValueError("Catalog digest mismatch")
        if root is None:
            root = identity
        elif root != identity:
            raise ValueError("Source/catalog mismatch")
        entries = manifest.get("tiles")
        if not isinstance(entries, list) or len(entries) > 128:
            raise ValueError("Input batch exceeds 128 tiles")
        for entry in entries:
            x, y = entry.get("x"), entry.get("y")
            if type(x) is not int or type(y) is not int or not 0 <= x < 3600 or not 0 <= y < 1800:
                raise ValueError("Tile address")
            key = f"{x}-{y}"
            if entry.get("file") != f"{key}.json.gz":
                raise ValueError("Tile path")
            if type(entry.get("jsonBytes")) is not int or not 0 < entry["jsonBytes"] <= MAX_TILE:
                raise ValueError("Decoded size limit")
            path = directory / entry["file"]
            if path.stat().st_size != entry.get("gzipBytes") or not 0 < path.stat().st_size <= MAX_TILE + 4096:
                raise ValueError("Compressed size mismatch")
            with gzip.open(path, "rb") as stream:
                raw = stream.read(MAX_TILE + 1)
            if len(raw) != entry["jsonBytes"] or digest(raw) != entry.get("sha256"):
                raise ValueError("Tile digest/length mismatch")
            tile = json.loads(raw.decode("utf-8", errors="strict"))
            if (tile.get("schema") != SCHEMA or tile.get("sourceSha256") != root["source"]["sha256"]
                or tile.get("catalogSha256") != root["catalogSha256"] or tile.get("tileX") != x or tile.get("tileY") != y):
                raise ValueError("Tile identity mismatch")
            descriptor = {k:entry[k] for k in ("x","y","file","jsonBytes","gzipBytes","sha256")}
            if key in tiles and tiles[key][0] != descriptor:
                raise ValueError("Conflicting duplicate tile")
            tiles[key] = (descriptor, path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="biome-batch-", dir=output.parent) as temporary:
        dest = Path(temporary) / "package"
        dest.mkdir()
        groups = {}
        for descriptor, path in tiles.values():
            group = (descriptor["x"] // 10, descriptor["y"] // 10)
            groups.setdefault(group, []).append(descriptor)
            shutil.copyfile(path, dest / descriptor["file"])
        if len(groups) > 4096:
            raise ValueError("Directory page ceiling")
        batches = []
        for (x,y), values in sorted(groups.items()):
            body = encoded({"schema":"world-drive-biome-page-v1", "revision":revision,
                "sourceSha256":root["source"]["sha256"], "catalogSha256":root["catalogSha256"],
                "x":x,"y":y,"tiles":sorted(values,key=lambda t:(t["y"],t["x"]))})
            if len(body)>65536:
                raise ValueError("Page size ceiling")
            filename = f"batch-{x}-{y}.json"
            (dest/filename).write_bytes(body)
            batches.append({"x":x,"y":y,"file":filename,"jsonBytes":len(body),"sha256":digest(body)})
        index = encoded({"schema":"world-drive-biome-directory-v1","revision":revision,**root,"batches":batches})
        if len(index)>2*1024*1024:
            raise ValueError("Directory byte ceiling")
        (dest/"directory.json").write_bytes(index)
        (dest/"ATTRIBUTION.txt").write_text(
            "RESOLVE Ecoregions 2017; Dinerstein et al. (2017), doi:10.1093/biosci/bix014.\n"
            "CC-BY-4.0 https://creativecommons.org/licenses/by/4.0/\n"
            f"Source SHA-256: {root['source']['sha256']}\n"
            "World Drive modification: original local refinement files regrouped into one-degree manifest pages.\n"
            "Partial coverage only. No geometry changed; absence is not ocean.\n", encoding="utf-8")
        dest.rename(output)
    return {"tiles":len(tiles),"batches":len(batches),"directoryBytes":len(index),"directorySha256":digest(index)}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",type=Path,action="append",required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--revision",required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.input,args.output,args.revision),indent=2))
