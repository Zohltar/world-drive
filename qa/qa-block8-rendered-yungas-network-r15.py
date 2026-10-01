"""Finite Yungas router fixture matcher. No live-game routing change."""
import math
from urllib.parse import urlsplit, unquote, parse_qs
POINTS=[[-67.81891,-16.29911],[-67.7861,-16.2577],[-67.73975,-16.23312]]
PREFIXES={'router.project-osrm.org':'/route/v1/driving/',
          'routing.openstreetmap.de':'/routed-car/route/v1/driving/'}
def is_yungas_route_request(url):
    try:
        p=urlsplit(url);prefix=PREFIXES.get(p.netloc)
        if p.scheme!='https' or not prefix or not p.path.startswith(prefix) or p.fragment:return False
        points=[[float(n) for n in a.split(',')] for a in unquote(p.path[len(prefix):]).split(';')]
        if points!=POINTS or any(not math.isfinite(n) for a in points for n in a):return False
        return parse_qs(p.query)=={'overview':['full'],'geometries':['geojson'],'steps':['false']}
    except (ValueError,TypeError):return False
if __name__=='__main__':
    from urllib.parse import quote
    coords=';'.join(','.join(str(v) for v in p) for p in POINTS);suffix='?overview=full&geometries=geojson&steps=false'
    groups=0
    for host,prefix in PREFIXES.items():
        url='https://'+host+prefix+coords+suffix
        assert is_yungas_route_request(url);assert is_yungas_route_request('https://'+host+prefix+quote(coords,safe='')+suffix);groups+=1
        for bad in [url.replace('https:','http:'),url.replace(host,host+'.evil.invalid'),url.replace('full','simplified'),url+'#x',url+'&overview=full',url.replace('-67.7861,-16.2577;',''),url.replace('-67.81891','NaN')]:
            assert not is_yungas_route_request(bad);groups+=1
    assert not is_yungas_route_request(None);groups+=1
    print('PASS Yungas HTTP fixture groups:',groups)
