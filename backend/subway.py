"""서울시 실시간 지하철 도착정보 프록시. 키(SEOUL_SUBWAY_KEY)는 서버에만 있다."""
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path


def _key():
    if os.environ.get('SEOUL_SUBWAY_KEY'):
        return os.environ['SEOUL_SUBWAY_KEY']
    env = Path(__file__).resolve().parent.parent / '.env'   # 로컬 개발용
    if env.is_file():
        for line in env.read_text(encoding='utf-8').splitlines():
            k, sep, v = line.strip().partition('=')
            if sep and k.strip() == 'SEOUL_SUBWAY_KEY':
                return v.strip().strip('"\'')
    return ''


KEY = _key()
ARRIVAL_FIELDS = ['subwayId', 'updnLine', 'trainLineNm', 'statnFid', 'statnTid', 'statnId', 'statnNm',
                  'ordkey', 'barvlDt', 'btrainNo', 'bstatnNm', 'btrainSttus', 'recptnDt',
                  'arvlMsg2', 'arvlMsg3', 'arvlCd', 'lstcarAt']
CACHE_SEC = 20   # 같은 역은 20초 안에 다시 안 부름 (일일 호출 한도 아끼기)
cache = {}


def arrivals(station):
    hit = cache.get(station)
    if hit and time.time() - hit[0] < CACHE_SEC:
        return hit[1]
    url = (f'http://swopenapi.seoul.go.kr/api/subway/{urllib.parse.quote(KEY)}/json/'
           f'realtimeStationArrival/0/40/{urllib.parse.quote(station)}')
    with urllib.request.urlopen(url, timeout=8) as r:
        data = json.load(r)
    rows = data.get('realtimeArrivalList')
    if rows is None:
        code = data.get('code') or (data.get('errorMessage') or {}).get('code')
        msg = data.get('message') or (data.get('errorMessage') or {}).get('message')
        # INFO-200: 해당 데이터 없음 (운행 종료 등) → 오류가 아니라 열차 없음
        out = {'ok': code == 'INFO-200', 'rows': [], 'error': None if code == 'INFO-200' else f'{code} {msg}'}
    else:
        out = {'ok': True, 'rows': [{k: r.get(k) for k in ARRIVAL_FIELDS} for r in rows]}
    out['fetchedAt'] = int(time.time() * 1000)
    cache[station] = (time.time(), out)
    return out
