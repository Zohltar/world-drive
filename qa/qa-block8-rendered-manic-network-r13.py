#!/usr/bin/env python3
"""Finite Manic HTTP fixture admission; semicolons belong to OSRM coordinates."""
import json
import math
from urllib.parse import unquote, urlsplit


def is_manic_route_request(url):
    if not isinstance(url,str):return False
    try:
        parsed=urlsplit(url)  # urlparse would remove the destination into .params.
        if parsed.scheme!='https' or parsed.hostname not in {'router.project-osrm.org','routing.openstreetmap.de'}:return False
        marker='/route/v1/driving/'
        if marker not in parsed.path:return False
        coordinates=unquote(parsed.path.split(marker,1)[1]).split(';')
        if len(coordinates)!=2:return False
        points=[list(map(float,row.split(','))) for row in coordinates]
        if any(len(p)!=2 or not all(math.isfinite(n) for n in p) for p in points):return False
        return all(abs(actual-expected)<.01 for p,q in zip(points,([ -68.3467,49.3213],[-68.7271214,50.6451065])) for actual,expected in zip(p,q))
    except (TypeError,ValueError,OverflowError):return False


def verify():
    a='https://router.project-osrm.org/route/v1/driving/'
    b='https://routing.openstreetmap.de/routed-car/route/v1/driving/'
    points='-68.3467,49.3213;-68.7271214,50.6451065'
    cases={
        'OSRM literal semicolon retains the destination':is_manic_route_request(a+points+'?overview=full&geometries=geojson&steps=false'),
        'second actual provider retains the destination':is_manic_route_request(b+points),
        'escaped coordinate separator':is_manic_route_request(a+points.replace(';','%3B').replace(',','%2C')),
        'missing destination is rejected':not is_manic_route_request(a+points.split(';')[0]),
        'reverse route is rejected':not is_manic_route_request(a+';'.join(points.split(';')[::-1])),
        'wrong endpoint is rejected':not is_manic_route_request(a+points.replace('50.6451065','48')),
        'nonfinite coordinates are rejected':not is_manic_route_request(a+points.replace('-68.3467','nan')),
        'unknown provider or profile is rejected':not is_manic_route_request((a+points).replace('router.project-osrm.org','example.invalid')) and not is_manic_route_request((a+points).replace('/driving/','/walking/')),
        'invalid value or extra waypoint is rejected':not is_manic_route_request(None) and not is_manic_route_request(a+points+';0,0'),
    }
    for name,result in cases.items():assert result,name
    report={'status':'PASS','groups':len(cases),'tests':list(cases)};print(json.dumps(report));return report

if __name__=='__main__':verify()
