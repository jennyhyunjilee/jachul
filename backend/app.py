"""쟈철 백엔드 (Render).

- /api/health        Render 상태 확인
- /api/status        실시간 지하철 키·Claude 채팅 켜졌는지
- /api/arrivals      역별 실시간 도착정보 (서울시 API, 20초 캐시)
- /api/chat          (선택) 채팅 질문을 Claude가 대답

API 키는 이 서버의 환경변수에만 있고 브라우저로 나가지 않는다.
프론트(Vercel)는 다른 도메인이라 ALLOWED_ORIGINS에 있는 곳에서만 요청을 받는다.
로컬에서는 frontend/ 폴더도 같이 내보내서 주소 하나로 확인할 수 있다.

    python3 backend/app.py              # http://127.0.0.1:5173
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
import argparse
import json
import os
import sys

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT.parent / 'frontend'
sys.path.insert(0, str(ROOT))
import chat
import subway

ALLOWED_ORIGINS = {o.strip().rstrip('/') for o in os.environ.get(
    'ALLOWED_ORIGINS', 'https://jachul.vercel.app').split(',') if o.strip()}
# Render에서는 SERVE_FRONTEND=0 (프론트는 Vercel이 맡음)
SERVE_FRONTEND = os.environ.get('SERVE_FRONTEND', '1') == '1' and FRONTEND.is_dir()
STATIC = {'/', '/index.html', '/config.js', '/auth.mjs', '/data/network.json'}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def log_message(self, fmt, *args):   # 질문 내용은 기록하지 않음
        pass

    # ---- 출처 확인 ----
    def origin_ok(self):
        origin = (self.headers.get('Origin') or '').rstrip('/')
        if not origin:
            return True   # 같은 주소에서 연 페이지(로컬)
        host = self.headers.get('Host', '')
        local = origin in {f'http://{host}', f'https://{host}'} and host.split(':')[0] in {'localhost', '127.0.0.1'}
        return local or origin in ALLOWED_ORIGINS

    def cors(self):
        origin = (self.headers.get('Origin') or '').rstrip('/')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

    def json_response(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        if not self.origin_ok():
            self.send_error(403)
            return
        self.send_response(204)
        self.cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/api/health':
            return self.json_response(200, {'ok': True})
        if url.path == '/api/status':
            return self.json_response(200, {'key': bool(subway.KEY), 'network': True, 'claude': chat.ready()})
        if url.path == '/api/arrivals':
            if not self.origin_ok():
                return self.json_response(403, {'ok': False, 'error': '허용된 페이지에서 요청해줘.'})
            station = (parse_qs(url.query).get('station') or [''])[0].strip()
            if not subway.KEY:
                return self.json_response(503, {'ok': False, 'error': '서버에 SEOUL_SUBWAY_KEY 가 없어'})
            if not station or len(station) > 30:
                return self.json_response(400, {'ok': False, 'error': 'station 이 이상해'})
            try:
                return self.json_response(200, subway.arrivals(station))
            except Exception:
                return self.json_response(502, {'ok': False, 'error': '서울시 API 호출 실패'})
        if SERVE_FRONTEND and unquote(url.path) in STATIC:
            return super().do_GET()
        self.send_error(404)

    def do_HEAD(self):
        if SERVE_FRONTEND and unquote(urlsplit(self.path).path) in STATIC:
            return super().do_HEAD()
        self.send_error(404)

    def do_POST(self):
        if urlsplit(self.path).path != '/api/chat':
            return self.json_response(404, {'ok': False, 'error': '없음'})
        if not self.origin_ok():
            return self.json_response(403, {'ok': False, 'error': '허용된 페이지에서 요청해줘.'})
        if not chat.ready():
            return self.json_response(503, {'ok': False, 'error': 'Claude 연결 안 됨'})
        try:
            length = min(int(self.headers.get('Content-Length') or 0), 20000)
            data = json.loads(self.rfile.read(length) or b'{}')
            question = str(data.get('question', '')).strip()[:200]
            context = data.get('context') if isinstance(data.get('context'), dict) else {}
        except (ValueError, json.JSONDecodeError):
            return self.json_response(400, {'ok': False, 'error': '요청이 이상해'})
        if not question:
            return self.json_response(400, {'ok': False, 'error': '질문이 비었어'})
        self.json_response(200, chat.reply(question, context))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=int(os.environ.get('PORT', '5173')))
    p.add_argument('--host', default=os.environ.get('HOST', '127.0.0.1'))
    a = p.parse_args()
    print(f'쟈철 백엔드: http://{a.host}:{a.port}/' + ('' if SERVE_FRONTEND else ' (API만)')
          + f" · 실시간 {'켜짐' if subway.KEY else '꺼짐'} · AI 채팅 {'Claude' if chat.claude_ready() else 'Groq' if chat.groq_ready() else '꺼짐'}", flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()
