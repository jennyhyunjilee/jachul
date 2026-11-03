"""쟈철 백엔드 (Render). 표준 라이브러리만 사용.

- /api/health        Render 상태 확인
- /api/ai/status     음성 AI(OpenAI) 연결 여부
- /api/intent        말한 문장 → 목표 필드 (OpenAI)
- /api/transcribe    녹음 → 글자 (OpenAI)

API 키는 이 서버의 환경변수에만 있고 브라우저로 나가지 않는다.
프론트(Vercel)는 다른 도메인이라 ALLOWED_ORIGINS에 있는 곳에서만 요청을 받는다.
로컬에서는 frontend/ 폴더도 같이 내보내서 주소 하나로 확인할 수 있다.

    python3 backend/app.py              # http://127.0.0.1:5183
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import json
import os
import sys

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT.parent / 'frontend'
sys.path.insert(0, str(ROOT))
from ai_proxy import OpenAIProxy, ApiError

ALLOWED_ORIGINS = {o.strip().rstrip('/') for o in os.environ.get(
    'ALLOWED_ORIGINS', 'https://jachul.vercel.app').split(',') if o.strip()}
# Render에서는 SERVE_FRONTEND=0 (프론트는 Vercel이 맡음)
SERVE_FRONTEND = os.environ.get('SERVE_FRONTEND', '1') == '1' and FRONTEND.is_dir()
STATIC = {'/', '/index.html', '/app.css', '/app.js', '/config.js', '/auth.mjs', '/characters.mjs', '/core.mjs',
          '/location.mjs', '/provider.mjs', '/routines.mjs', '/calendar.mjs', '/voice.mjs', '/data/network.json'}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def log_message(self, fmt, *args):   # 요청 내용(음성·문장)은 기록하지 않음
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
        path = urlsplit(self.path).path
        if path == '/api/health':
            return self.json_response(200, {'ok': True})
        if path == '/api/ai/status':
            if not self.origin_ok():
                return self.json_response(403, {'error': {'code': 'origin', 'message': '허용된 페이지에서 요청해줘.'}})
            return self.json_response(200, OpenAIProxy().status())
        if SERVE_FRONTEND and unquote(path) in STATIC:
            return super().do_GET()
        self.send_error(404)

    def do_HEAD(self):
        if SERVE_FRONTEND and unquote(urlsplit(self.path).path) in STATIC:
            return super().do_HEAD()
        self.send_error(404)

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            if path not in {'/api/intent', '/api/transcribe'}:
                raise ApiError(404, 'not_found', '찾을 수 없는 요청이야.')
            if not self.origin_ok():
                raise ApiError(403, 'origin', '허용된 페이지에서 요청해줘.')
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise ApiError(400, 'invalid_input', '입력 크기를 확인하지 못했어.')
            limit = 4 * 1024 * 1024 if path == '/api/transcribe' else 16384
            if length <= 0 or length > limit:
                raise ApiError(413, 'input_size', '입력이 너무 크거나 비어 있어.')
            self.connection.settimeout(30)
            body = self.rfile.read(length)
            if len(body) != length:
                raise ApiError(400, 'invalid_input', '입력을 끝까지 받지 못했어.')
            proxy = OpenAIProxy()
            if path == '/api/intent':
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise ApiError(415, 'content_type', 'JSON 문장 입력이 필요해.')
                try:
                    obj = json.loads(body)
                except (ValueError, UnicodeError):
                    raise ApiError(400, 'invalid_input', '문장 입력 형식을 확인해줘.')
                result = proxy.intent(obj)
            else:
                result = proxy.transcribe(body, self.headers.get('Content-Type', ''))
            self.json_response(200, result)
        except ApiError as e:
            self.json_response(e.status, {'error': {'code': e.code, 'message': e.message}})
        except (TimeoutError, OSError):
            self.json_response(504, {'error': {'code': 'timeout', 'message': '요청 시간이 초과됐어. 다시 시도해줘.'}})
        except Exception:
            self.json_response(500, {'error': {'code': 'internal', 'message': '요청을 처리하지 못했어. 직접 입력으로 계속해줘.'}})


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=int(os.environ.get('PORT', '5183')))
    p.add_argument('--host', default=os.environ.get('HOST', '127.0.0.1'))
    a = p.parse_args()
    print(f'쟈철 백엔드: http://{a.host}:{a.port}/' + ('' if SERVE_FRONTEND else ' (API만)'), flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()
