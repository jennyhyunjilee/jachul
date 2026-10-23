#!/usr/bin/env python3
"""잔소리역 로컬 서버: 페이지 + 서울시 실시간 지하철 API 프록시.

API 키는 이 서버에만 있고 브라우저로는 절대 안 나간다.

    python3 server.py   # http://localhost:5173
"""
import json
import os
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from lines import load_env

ROOT = os.path.dirname(os.path.abspath(__file__))
load_env(ROOT)
KEY = os.environ.get("SEOUL_SUBWAY_KEY", "")
PORT = int(os.environ.get("PORT", "5173"))
NETWORK = os.path.join(ROOT, "data", "network.json")

# 공개해도 되는 파일만. .env 같은 건 절대 안 내보냄.
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/data/network.json": ("data/network.json", "application/json; charset=utf-8"),
}
ARRIVAL_FIELDS = ["subwayId", "updnLine", "trainLineNm", "statnFid", "statnTid", "statnId", "statnNm",
                  "ordkey", "barvlDt", "btrainNo", "bstatnNm", "btrainSttus", "recptnDt",
                  "arvlMsg2", "arvlMsg3", "arvlCd", "lstcarAt"]
CACHE_SEC = 20  # 같은 역은 20초 안에 다시 안 부름 (일일 호출 한도 아끼기)
cache = {}


def arrivals(station):
    hit = cache.get(station)
    if hit and time.time() - hit[0] < CACHE_SEC:
        return hit[1]
    url = (f"http://swopenapi.seoul.go.kr/api/subway/{urllib.parse.quote(KEY)}/json/"
           f"realtimeStationArrival/0/40/{urllib.parse.quote(station)}")
    with urllib.request.urlopen(url, timeout=8) as r:
        data = json.load(r)
    rows = data.get("realtimeArrivalList")
    if rows is None:
        code = data.get("code") or (data.get("errorMessage") or {}).get("code")
        msg = data.get("message") or (data.get("errorMessage") or {}).get("message")
        # INFO-200: 해당 데이터 없음 (운행 종료 등) → 오류가 아니라 열차 없음
        out = {"ok": code == "INFO-200", "rows": [], "error": None if code == "INFO-200" else f"{code} {msg}"}
    else:
        out = {"ok": True, "rows": [{k: r.get(k) for k in ARRIVAL_FIELDS} for r in rows]}
    out["fetchedAt"] = int(time.time() * 1000)
    cache[station] = (time.time(), out)
    return out


# ---- 채팅에 Claude 연결 (선택) ----
# anthropic 패키지(파이썬 3.10+)와 ANTHROPIC_API_KEY 가 있으면 켜짐. 없으면 화면이 내장 대답을 씀.
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
CHAT_SYSTEM = """너는 '잔소리역'이라는 지하철 지각 방지 앱의 에이전트야. 사용자가 늦지 않게 보채는 게 일이야.
- 말투: 반말. 솔직하고 짧게, 2~3문장. 돌려 말하지 말고 지금 해야 할 행동을 말해.
- 시각·열차·몇 분 늦는지는 [상황]에 있는 값만 써. 없는 정보는 지어내지 말고 모른다고 해.
- 지하철·출발과 상관없는 질문이면 한 마디로 받아치고 출발 얘기로 돌아와.
- 형식: 첫 줄은 20자 이내 한 마디, 둘째 줄부터 설명. 마크다운 쓰지 마."""


def claude_ready():
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def claude_reply(question, context):
    import anthropic
    client = anthropic.Anthropic()
    try:
        resp = client.beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=16000,
            output_config={"effort": "low"},             # 짧은 채팅이라 낮은 노력으로 빠르게
            betas=["server-side-fallback-2026-07-01"],   # 안전 분류기가 거절하면 다른 모델로 자동 재시도
            fallbacks="default",
            system=CHAT_SYSTEM,
            messages=[{"role": "user", "content":
                       f"[상황]\n{json.dumps(context, ensure_ascii=False)}\n\n[질문]\n{question}"}],
        )
    except anthropic.RateLimitError:
        return {"ok": False, "error": "Claude 호출이 너무 많아. 잠깐 뒤에 다시."}
    except anthropic.AuthenticationError:
        return {"ok": False, "error": "Claude API 키가 안 맞아."}
    except anthropic.APIStatusError as e:
        return {"ok": False, "error": f"Claude 오류 {e.status_code}"}
    except anthropic.APIConnectionError:
        return {"ok": False, "error": "Claude 연결 실패"}
    if resp.stop_reason == "refusal":
        return {"ok": False, "error": "Claude가 대답을 거절했어"}
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    if not text:
        return {"ok": False, "error": "빈 대답"}
    title, _, body = text.partition("\n")
    return {"ok": True, "title": title.strip(), "body": body.strip()}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/chat":
            return self.send_json({"error": "없음"}, 404)
        if not claude_ready():
            return self.send_json({"ok": False, "error": "Claude 연결 안 됨"}, 503)
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 20000)
            data = json.loads(self.rfile.read(length) or b"{}")
            question = str(data.get("question", "")).strip()[:200]
            context = data.get("context") if isinstance(data.get("context"), dict) else {}
        except (ValueError, json.JSONDecodeError):
            return self.send_json({"ok": False, "error": "요청이 이상해"}, 400)
        if not question:
            return self.send_json({"ok": False, "error": "질문이 비었어"}, 400)
        return self.send_json(claude_reply(question, context))

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/api/status":
            return self.send_json({"key": bool(KEY), "network": os.path.exists(NETWORK), "claude": claude_ready()})
        if url.path == "/api/arrivals":
            station = (urllib.parse.parse_qs(url.query).get("station") or [""])[0].strip()
            if not KEY:
                return self.send_json({"ok": False, "error": "서버에 SEOUL_SUBWAY_KEY 가 없어"}, 503)
            if not station:
                return self.send_json({"ok": False, "error": "station 이 비었어"}, 400)
            try:
                return self.send_json(arrivals(station))
            except Exception as e:  # 네트워크 오류 등
                return self.send_json({"ok": False, "error": f"API 호출 실패: {e}"}, 502)
        if url.path in STATIC:
            rel, ctype = STATIC[url.path]
            path = os.path.join(ROOT, rel)
            if not os.path.exists(path):
                return self.send_json({"error": "없음"}, 404)
            with open(path, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        self.send_json({"error": "없음"}, 404)

    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {fmt % args}")


if __name__ == "__main__":
    print(f"잔소리역 → http://localhost:{PORT}  (실시간 키 {'있음' if KEY else '없음 · 데모 모드'}, Claude 채팅 {'켜짐' if claude_ready() else '꺼짐'})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
