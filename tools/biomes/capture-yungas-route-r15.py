#!/usr/bin/env python3
"""Explicit build-time capture of the game's real Chuspipata -> Yolosa via the historic Yungas waypoint route.
No import-time I/O. No synthetic fallback. The response and its provenance are
retained for review and pinning; captures are NOT automatically trusted fixtures.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.request

POINTS = [[-67.81891, -16.29911], [-67.7861, -16.2577], [-67.73975, -16.23312]]
COORDS = ';'.join(','.join(str(v) for v in p) for p in POINTS)
URLS = [
    'https://router.project-osrm.org/route/v1/driving/',
    'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
]
MAX_BYTES = 2 * 1024 * 1024


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 12742017.6 * math.asin(math.sqrt(min(1, max(0, h))))


def validate(raw):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= MAX_BYTES:
        raise ValueError('Response exceeds the bounded capture size')
    data = json.loads(raw)
    if data.get('code') != 'Ok' or not data.get('routes'):
        raise ValueError('No real route returned')
    route = data['routes'][0]
    geometry = route.get('geometry', {})
    pts = geometry.get('coordinates')
    if geometry.get('type') != 'LineString' or not isinstance(pts, list) or not 50 <= len(pts) <= 20000:
        raise ValueError('Expected a full road polyline of 50..20000 vertices')
    for p in pts:
        if (not isinstance(p, list) or len(p) != 2
            or any(type(v) not in (int, float) or not math.isfinite(v) for v in p)
            or not (-67.95 <= p[0] <= -67.60 and -16.40 <= p[1] <= -16.10)):
            raise ValueError('Invalid or out-of-region Yungas position')
    if any(distance(p, expected) > 500 for p, expected in zip((pts[0], pts[-1]), (POINTS[0], POINTS[-1]))):
        raise ValueError('Endpoint mismatch or reversed route')
    lengths = [distance(a, b) for a, b in zip(pts, pts[1:])]
    total = sum(lengths)
    if min(distance(p, POINTS[1]) for p in pts) > 500:
        raise ValueError('Historic-road waypoint missing')
    if not 10000 <= total <= 45000 or max(lengths) > 2000:
        raise ValueError('Unexpected road length or discontinuity')
    reported = route.get('distance')
    if type(reported) not in (int, float) or not math.isfinite(reported) or abs(reported-total) > total*.05:
        raise ValueError('Reported distance inconsistent with full geometry')
    return data, dict(pointCount=len(pts), lengthMeters=total, reportedDistanceMeters=reported,
                      maxSegmentMeters=max(lengths), coordinatesSha256=sha(encode(pts)))


def capture(output):
    if output.exists() or output.is_symlink():
        raise FileExistsError('Capture destination already exists; no overwrite')
    errors = []
    for prefix in URLS:
        url = prefix + COORDS + '?overview=full&geometries=geojson&steps=false'
        try:
            request = urllib.request.Request(url, headers={'User-Agent':'WorldDrive-biome-pilot-authoring/1',
                'Accept':'application/json', 'Accept-Encoding':'identity'})
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status != 200 or response.geturl() != url:
                    raise ValueError('Unexpected response/redirect')
                raw = response.read(MAX_BYTES+1)
            data, info = validate(raw)
            receipt = {'schema':'world-drive-real-road-capture-v1', 'route':'chuspipata-yolosa-yungas',
                'requestPoints':POINTS, 'url':url,
                'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'dataVersion':data.get('data_version'), 'responseBytes':len(raw),
                'responseSha256':sha(raw), **info,
                'attribution':'OpenStreetMap contributors', 'license':'ODbL-1.0',
                'licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/',
                'sourceUrl':'https://www.openstreetmap.org/copyright',
                'scope':'Build-time real router snapshot; not a driving trace or current access guarantee',
                'automaticPinning':False}
            output.mkdir(parents=True)
            (output/'response.json.gz').write_bytes(gzip.compress(raw, mtime=0))
            (output/'receipt.json').write_bytes(encode(receipt))
            print(json.dumps(receipt, indent=2))
            return receipt
        except Exception as exc:
            errors.append(f'{prefix}: {type(exc).__name__}: {exc}')
    raise RuntimeError('No real route captured; no synthetic fallback. '+ '; '.join(errors))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    capture(args.output)
