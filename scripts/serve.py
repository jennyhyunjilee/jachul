"""Local frontend and fixed OpenAI bridge. Never exposes credentials or sources."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import json
import sys
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from ai_proxy import OpenAIProxy, ApiError
ALLOWED={'/','/index.html','/app.css','/app.js','/characters.mjs','/core.mjs','/location.mjs','/provider.mjs','/routines.mjs','/calendar.mjs','/voice.mjs','/data/network.json'}
class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        if urlsplit(self.path).path=='/api/ai/status':
            if not self.same_origin(): self.json_response(403,{'error':{'code':'origin','message':'같은 페이지에서 요청해줘.'}});return
            self.json_response(200,OpenAIProxy().status());return
        if unquote(urlsplit(self.path).path) not in ALLOWED:
            self.send_error(404);return
        super().do_GET()
    def same_origin(self):
        host=self.headers.get('Host','')
        if host not in {f'localhost:{self.server.server_port}',f'127.0.0.1:{self.server.server_port}'}: return False
        origin=self.headers.get('Origin')
        return origin is None or origin in {'http://'+host,'https://'+host}
    def json_response(self,status,obj):
        body=json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError): pass
    def do_POST(self):
        path=urlsplit(self.path).path
        try:
            if path not in {'/api/intent','/api/transcribe'}: raise ApiError(404,'not_found','찾을 수 없는 요청이야.')
            if not self.same_origin(): raise ApiError(403,'origin','같은 페이지에서 요청해줘.')
            try: length=int(self.headers.get('Content-Length','0'))
            except ValueError: raise ApiError(400,'invalid_input','입력 크기를 확인하지 못했어.')
            limit=4*1024*1024 if path=='/api/transcribe' else 16384
            if length<=0 or length>limit: raise ApiError(413,'input_size','입력이 너무 크거나 비어 있어.')
            self.connection.settimeout(30)
            body=self.rfile.read(length)
            if len(body)!=length: raise ApiError(400,'invalid_input','입력을 끝까지 받지 못했어.')
            proxy=OpenAIProxy()
            if path=='/api/intent':
                if self.headers.get('Content-Type','').split(';')[0]!='application/json': raise ApiError(415,'content_type','JSON 문장 입력이 필요해.')
                try: obj=json.loads(body)
                except (ValueError,UnicodeError): raise ApiError(400,'invalid_input','문장 입력 형식을 확인해줘.')
                result=proxy.intent(obj)
            else: result=proxy.transcribe(body,self.headers.get('Content-Type',''))
            self.json_response(200,result)
        except ApiError as e: self.json_response(e.status,{'error':{'code':e.code,'message':e.message}})
        except (TimeoutError,OSError): self.json_response(504,{'error':{'code':'timeout','message':'요청 시간이 초과됐어. 다시 시도해줘.'}})
        except Exception: self.json_response(500,{'error':{'code':'internal','message':'요청을 처리하지 못했어. 직접 입력으로 계속해줘.'}})
    def do_HEAD(self):
        if unquote(urlsplit(self.path).path) not in ALLOWED:
            self.send_error(404);return
        super().do_HEAD()
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=5183);a=p.parse_args()
    print(f'Static frontend: http://127.0.0.1:{a.port}/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',a.port),StaticHandler).serve_forever()
