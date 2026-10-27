import io
import json
import socket
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from ai_proxy import OpenAIProxy, ApiError, SCHEMA, settings

INTENT={'from':'홍대입구','to':'이대','date':'2026-10-28','arrive':'09:00','prep':30,'time_ambiguous':False}
def response(obj):
    return io.BytesIO(json.dumps(obj).encode())
def output(intent=INTENT):
    return {'output':[{'content':[{'type':'output_text','text':json.dumps(intent)}]}]}
class ProxyTests(unittest.TestCase):
    def test_key_absent_status_and_503(self):
        p=OpenAIProxy({});self.assertEqual(p.status(),{'configured':False,'provider':'openai','transcription':False})
        with self.assertRaises(ApiError) as e:p.intent({'transcript':'내일 오전9시 이대'})
        self.assertEqual(e.exception.status,503)
    def test_request_contract_and_no_store(self):
        seen={}
        def call(req,timeout):
            seen.update(url=req.full_url,payload=json.loads(req.data),timeout=timeout)
            return response(output())
        result=OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},call).intent({'transcript':'내일 오전9시 이대 준비30분','defaults':{'from':'홍대입구','home':{'lat':1,'lon':2}},'context':{}})
        self.assertEqual(result['source'],'openai');self.assertEqual(result['intent']['to'],'이대')
        self.assertEqual(seen['url'],'https://api.openai.com/v1/responses');self.assertFalse(seen['payload']['store'])
        self.assertEqual(seen['payload']['model'],'gpt-4.1-mini');self.assertTrue(seen['payload']['text']['format']['strict']);self.assertFalse(SCHEMA['additionalProperties'])
        self.assertNotIn('home',json.loads(seen['payload']['input'])['defaults'])
    def test_optional_models(self):
        seen=[]
        def call(req,timeout):seen.append(req.data);return response(output())
        OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder','OPENAI_INTENT_MODEL':'custom-intent'},call).intent({'transcript':'이대'})
        self.assertEqual(json.loads(seen[0])['model'],'custom-intent')
    def test_upstream_http_errors_are_sanitized(self):
        for status,expected in [(401,401),(429,429),(500,502)]:
            def call(req,timeout):raise HTTPError(req.full_url,status,'secret should never escape',{},io.BytesIO(b'private upstream body'))
            with self.assertRaises(ApiError) as e:OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},call).intent({'transcript':'이대'})
            self.assertEqual(e.exception.status,expected);self.assertNotIn('secret',e.exception.message)
    def test_timeout_network_and_malformed_response(self):
        for error,status in [(socket.timeout(),504),(URLError('private'),502)]:
            def call(req,timeout):raise error
            with self.assertRaises(ApiError) as e:OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},call).intent({'transcript':'이대'})
            self.assertEqual(e.exception.status,status)
        for obj in [{'output':None},output({'from':'이대'}),output({**INTENT,'prep':'30'}),output({**INTENT,'date':'2026-02-30'})]:
            with self.assertRaises(ApiError):OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},lambda *a,**k:response(obj)).intent({'transcript':'이대'})
    def test_refusal(self):
        obj={'output':[{'content':[{'type':'refusal','refusal':'private'}]}]}
        with self.assertRaises(ApiError) as e:OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},lambda *a,**k:response(obj)).intent({'transcript':'이대'})
        self.assertEqual(e.exception.status,422)
    def test_nonexistent_same_and_disconnected_stations(self):
        for obj in [{**INTENT,'to':'없는역'},{**INTENT,'to':'홍대입구'}]:
            r=OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},lambda *a,**k:response(output(obj))).intent({'transcript':'목표'})
            self.assertIsNone(r['intent']['to']);self.assertIn('to',r['invalid_fields'])
    def test_audio_multipart_preserves_format_and_model(self):
        seen={}
        def call(req,timeout):seen.update(url=req.full_url,body=req.data);return response({'text':'내일 오전9시 이대'})
        r=OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},call).transcribe(b'test audio bytes','audio/webm;codecs=opus')
        self.assertEqual(r['transcript'],'내일 오전9시 이대');self.assertEqual(seen['url'],'https://api.openai.com/v1/audio/transcriptions')
        self.assertIn(b'filename="speech.webm"',seen['body']);self.assertIn(b'Content-Type: audio/webm',seen['body']);self.assertIn(b'gpt-transcribe',seen['body'])
    def test_audio_limits_and_empty_transcription(self):
        p=OpenAIProxy({})
        for audio,kind in [(b'','audio/webm'),(b'x'*(4*1024*1024+1),'audio/webm'),(b'x','text/html')]:
            with self.assertRaises(ApiError):p.transcribe(audio,kind)
        with self.assertRaises(ApiError):OpenAIProxy({'OPENAI_API_KEY':'unit-test-placeholder'},lambda *a,**k:response({'text':''})).transcribe(b'x','audio/mp4')
    def test_input_limits(self):
        for obj in [None,{}, {'transcript':'x'*1501},{'transcript':'x','defaults':[]}]:
            with self.assertRaises(ApiError):OpenAIProxy({}).intent(obj)
if __name__=='__main__':unittest.main()
