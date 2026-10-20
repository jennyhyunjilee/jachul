#!/usr/bin/env python3
"""서울시 지하철 실시간 도착정보(일괄)로 전체 노선도를 만든다.

응답 한 줄마다 statnId(이 역), statnFid(이전 역), statnTid(다음 역)가 있어서
한 번만 받아도 전 노선의 역과 인접 관계(지선·순환선 포함)가 나온다.

    python3 build_network.py            # .env 의 SEOUL_SUBWAY_KEY 사용
    python3 build_network.py --passes 3 # 운행이 뜸한 시간엔 여러 번 받아서 합치기
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

from lines import LINE_META, load_env

ROOT = os.path.dirname(os.path.abspath(__file__))


def fetch_all(key):
    url = f"http://swopenapi.seoul.go.kr/api/subway/{urllib.parse.quote(key)}/json/realtimeStationArrival/ALL"
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.load(r)
    if "realtimeArrivalList" not in data:
        sys.exit(f"API 오류: {data.get('code')} {data.get('message')}")
    return data["realtimeArrivalList"], (data.get("errorMessage") or {}).get("total")


def valid_id(x):
    return isinstance(x, str) and len(x) == 10 and x.isdigit() and int(x[4:]) > 0


def components(ids, adj):
    seen, count = set(), 0
    for start in ids:
        if start in seen:
            continue
        count += 1
        stack = [start]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            stack.extend(n for n in adj[cur] if n in ids)
    return count


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key")
    ap.add_argument("--passes", type=int, default=2)
    ap.add_argument("--gap", type=int, default=30, help="회차 사이 대기(초)")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "network.json"))
    args = ap.parse_args()

    load_env(ROOT)
    key = args.key or os.environ.get("SEOUL_SUBWAY_KEY")
    if not key:
        sys.exit("SEOUL_SUBWAY_KEY 가 없어. .env 에 넣거나 --key 로 줘.")

    nodes, edges = {}, set()
    for p in range(args.passes):
        rows, total = fetch_all(key)
        print(f"{p + 1}회차: {len(rows)}건 받음 (전체 {total}건)")
        for r in rows:
            line, sid = r.get("subwayId"), r.get("statnId")
            if line not in LINE_META or not valid_id(sid):
                continue
            nodes[sid] = {"n": r["statnNm"], "l": line}
            for nb in (r.get("statnFid"), r.get("statnTid")):
                if valid_id(nb) and nb != sid and nb[:4] == line:
                    edges.add(tuple(sorted((sid, nb))))
        if p < args.passes - 1:
            time.sleep(args.gap)

    unnamed = {x for e in edges for x in e} - nodes.keys()
    edges = sorted(e for e in edges if e[0] in nodes and e[1] in nodes)

    adj = defaultdict(set)
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    by_line = defaultdict(set)
    for sid, nd in nodes.items():
        by_line[nd["l"]].add(sid)

    print(f"\n역 {len(nodes)}개, 연결 {len(edges)}개, 이름 모르는 역 {len(unnamed)}개")
    for line in sorted(by_line):
        ids = by_line[line]
        comp = components(ids, adj)
        warn = "" if comp == 1 else f"  ← {comp}조각으로 끊김 (--passes 늘려서 다시)"
        print(f"  {LINE_META[line]['name']:<6} {len(ids):>3}역{warn}")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({
            "source": "서울시 지하철 실시간 도착정보(일괄)",
            "builtAt": time.strftime("%Y-%m-%d %H:%M"),
            "lines": {l: LINE_META[l] for l in sorted(by_line)},
            "nodes": nodes,
            "edges": edges,
        }, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n저장: {args.out}")


if __name__ == "__main__":
    main()
