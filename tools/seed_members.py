#!/usr/bin/env python3
"""회원 명부(회원_명부.txt, 깃에 안 올림)를 Supabase에 등록한다.

명부 형식: 한 줄에 `이름<TAB>이메일`
- public.jachul_members 에 이름·이메일 저장 (있으면 이름만 갱신)
- 로그인 계정(auth.users)이 없으면 만든다. 비밀번호는 없이 만들고,
  회원이 처음 접속해서 "비밀번호 만들기"를 누르면 메일 링크로 직접 정한다.
- 메일은 여기서 보내지 않는다.

    python3 tools/seed_members.py            # 실제 등록
    python3 tools/seed_members.py --dry-run  # 무엇을 할지만 출력

.env 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service_role 키는 절대 커밋·프론트 금지)
"""
import argparse
import json
import os
import sys
import unicodedata
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lines import load_env


def read_roster(root):
    name = next((f for f in os.listdir(root) if "명부" in unicodedata.normalize("NFC", f) and f.endswith(".txt")), None)
    if not name:
        sys.exit("회원_명부.txt 가 없어.")
    rows = []
    for line in open(os.path.join(root, name), encoding="utf-8"):
        parts = [p.strip() for p in line.replace(",", "\t").split("\t") if p.strip()]
        if len(parts) >= 2 and "@" in parts[-1]:
            rows.append((unicodedata.normalize("NFC", parts[0]), parts[-1].lower()))
    return rows


def call(method, url, key, body=None, prefer=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode()
            return r.status, json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "null")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    load_env(ROOT)
    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit(".env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 넣어줘.")
    roster = read_roster(ROOT)
    print(f"명부 {len(roster)}명")
    if args.dry_run:
        return
    status, _ = call("POST", f"{url}/rest/v1/jachul_members?on_conflict=email", key,
                     [{"email": e, "name": n} for n, e in roster], prefer="resolution=merge-duplicates")
    print(f"jachul_members 등록: HTTP {status}")
    _, data = call("GET", f"{url}/auth/v1/admin/users?per_page=1000", key)
    existing = {u["email"].lower() for u in (data or {}).get("users", [])}
    for n, e in roster:
        if e in existing:
            print(f"  있음  {n}")
            continue
        status, res = call("POST", f"{url}/auth/v1/admin/users", key,
                           {"email": e, "email_confirm": True, "user_metadata": {"name": n}})
        print(f"  {'만듦' if status < 300 else '실패 ' + str(res)}  {n}")


if __name__ == "__main__":
    main()
