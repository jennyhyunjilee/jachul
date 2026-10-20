#!/usr/bin/env python3
"""서울시 지하철 실시간 도착정보로 전체 노선도를 만든다.

응답 한 줄마다 statnId(이 역), statnFid(이전 역), statnTid(다음 역)가 있어서
역과 인접 관계(지선·순환선 포함)를 그대로 얻을 수 있다.

두 가지 방법:
  1. 일괄(ALL): 한 번 호출로 전 노선. 키에 일괄 권한이 있어야 함.
  2. 역별 탐색: 일괄이 막힌 키(ERROR-340)면 자동 전환. 역 하나씩 물어보고
     응답의 "OO방면"(다음 역 이름)을 따라가며 전 노선을 훑는다.
     약 600번 호출 (하루 한도 1,000건). 받은 응답은 data/crawl_cache.json 에
     저장해서, 한도에 걸려 멈춰도 다음에 이어서 한다.

    python3 build_network.py               # .env 의 SEOUL_SUBWAY_KEY 사용
    python3 build_network.py --budget 300  # 이번 실행에서 최대 300번만 호출
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict, deque

from lines import LINE_META, load_env

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = "http://swopenapi.seoul.go.kr/api/subway"
CACHE = os.path.join(ROOT, "data", "crawl_cache.json")

# 역별 탐색 출발점: 노선마다 한 역씩 (하나가 실패해도 환승으로 이어짐)
SEEDS = ["서울", "시청", "교대", "사당", "광화문", "합정", "건대입구", "잠실", "고속터미널",
         "공덕", "김포공항", "상봉", "선릉", "강남", "성신여대입구", "소사", "판교", "보라매", "수서"]


class ApiError(Exception):
    def __init__(self, code, msg):
        super().__init__(f"{code} {msg}")
        self.code = code


def get(url, timeout=20):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        data = json.load(r)
    rows = data.get("realtimeArrivalList")
    if rows is not None:
        return rows, (data.get("errorMessage") or {}).get("total")
    code = data.get("code") or (data.get("errorMessage") or {}).get("code")
    if code == "INFO-200":  # 해당 데이터 없음 (지금 오는 열차 없음)
        return [], 0
    raise ApiError(code, data.get("message") or (data.get("errorMessage") or {}).get("message"))


def fetch_all(key):
    return get(f"{BASE}/{urllib.parse.quote(key)}/json/realtimeStationArrival/ALL", timeout=30)


def fetch_station(key, name):
    rows, _ = get(f"{BASE}/{urllib.parse.quote(key)}/json/realtimeStationArrival/0/60/{urllib.parse.quote(name)}")
    return rows


def crawl(key, budget):
    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    queue, seen, calls, rows_all, stopped = deque(SEEDS), set(), 0, [], None
    while queue:
        name = queue.popleft()
        if name in seen:
            continue
        seen.add(name)
        if name in cache:
            rows = cache[name]
        else:
            if calls >= budget:
                stopped = f"이번 실행 호출 한도 {budget}번 도달"
                break
            try:
                rows = fetch_station(key, name)
            except ApiError as e:
                if e.code in ("ERROR-337", "ERROR-338"):  # 일일 한도 초과 등
                    stopped = f"API가 멈춤: {e}"
                    break
                print(f"  {name}: 건너뜀 ({e})")
                rows = []
            calls += 1
            cache[name] = rows
            if calls % 50 == 0:
                print(f"  {calls}번 호출, 역 {len(seen)}개 확인")
                save_cache(cache)
            time.sleep(0.15)
        rows_all += rows
        for r in rows:
            m = re.search(r"-\s*(.+?)방면", r.get("trainLineNm") or "")
            if m:
                queue.append(m.group(1).strip())
    save_cache(cache)
    left = len([n for n in queue if n not in seen])
    print(f"역별 탐색: 이번에 {calls}번 호출, 저장된 역 {len(cache)}개")
    if stopped:
        print(f"  ⚠ {stopped}. 남은 역 약 {left}개 → 내일(또는 --budget 늘려서) 다시 실행하면 이어서 함")
    return rows_all, stopped


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))


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
    ap.add_argument("--passes", type=int, default=2, help="일괄 모드에서 몇 번 받아 합칠지")
    ap.add_argument("--gap", type=int, default=30, help="일괄 회차 사이 대기(초)")
    ap.add_argument("--budget", type=int, default=800, help="역별 탐색에서 이번 실행 최대 호출 수")
    ap.add_argument("--crawl", action="store_true", help="일괄을 건너뛰고 바로 역별 탐색")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "network.json"))
    args = ap.parse_args()

    load_env(ROOT)
    key = args.key or os.environ.get("SEOUL_SUBWAY_KEY")
    if not key:
        sys.exit("SEOUL_SUBWAY_KEY 가 없어. .env 에 넣거나 --key 로 줘.")

    batches, source, stopped = [], "서울시 지하철 실시간 도착정보(일괄)", None
    if not args.crawl:
        try:
            for p in range(args.passes):
                rows, total = fetch_all(key)
                print(f"일괄 {p + 1}회차: {len(rows)}건 받음 (전체 {total}건)")
                batches.append(rows)
                if p < args.passes - 1:
                    time.sleep(args.gap)
        except ApiError as e:
            print(f"일괄 안 됨: {e}\n→ 역별 탐색으로 전환")
            batches = []
    if not batches:
        rows, stopped = crawl(key, args.budget)
        batches, source = [rows], "서울시 지하철 실시간 도착정보(역별 탐색)"

    nodes, edges = {}, set()
    for rows in batches:
        for r in rows:
            line, sid = r.get("subwayId"), r.get("statnId")
            if line not in LINE_META or not valid_id(sid):
                continue
            nodes[sid] = {"n": r["statnNm"], "l": line}
            for nb in (r.get("statnFid"), r.get("statnTid")):
                if valid_id(nb) and nb != sid and nb[:4] == line:
                    edges.add(tuple(sorted((sid, nb))))

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
        warn = "" if comp == 1 else f"  ← {comp}조각으로 끊김"
        print(f"  {LINE_META[line]['name']:<6} {len(ids):>3}역{warn}")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({
            "source": source,
            "builtAt": time.strftime("%Y-%m-%d %H:%M"),
            "partial": bool(stopped),
            "lines": {l: LINE_META[l] for l in sorted(by_line)},
            "nodes": nodes,
            "edges": edges,
        }, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n저장: {args.out}" + ("  (아직 일부만 — 다시 실행하면 이어서 채움)" if stopped else ""))


if __name__ == "__main__":
    main()
