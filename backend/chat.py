"""(선택) 채팅에 AI 연결. 아래 중 키가 있는 걸 씀 (둘 다 있으면 Claude 먼저):
- Claude: anthropic 패키지 + ANTHROPIC_API_KEY (유료)
- Groq: GROQ_API_KEY (console.groq.com 무료 키, 카드 필요 없음. 패키지 필요 없음)
둘 다 없으면 화면이 내장 대답(패턴)을 씀. 키는 Render 환경변수에만 (깃·프론트 금지)."""
import json
import os
import urllib.error
import urllib.request

GROQ_MODEL = os.environ.get('GROQ_MODEL', 'llama-3.3-70b-versatile')

CLAUDE_MODEL = os.environ.get('CLAUDE_MODEL', 'claude-opus-5-5')
CHAT_SYSTEM = """너는 '쟈철'이라는 지하철 지각 방지 앱의 에이전트야. 사용자가 늦지 않게 보채는 게 일이야.
- 말투: 반말. 솔직하고 짧게, 2~3문장. 돌려 말하지 말고 지금 해야 할 행동을 말해.
- 늦는다고 남한테 보낼 말을 써 달라면, 둘째 줄에 그대로 복사해 보낼 문장을 따옴표 안에 써. 이 문장은 사용자가 원하는 말투로 (존댓말·교수님께·친구한테 등). 따로 말 없으면 반말.
- 시각·열차·몇 분 늦는지는 [상황]에 있는 값만 써. 없는 정보는 지어내지 말고 모른다고 해.
- 지하철·출발과 상관없는 질문이면 한 마디로 받아치고 출발 얘기로 돌아와.
- 형식: 첫 줄은 20자 이내 한 마디, 둘째 줄부터 설명. 마크다운 쓰지 마."""


def claude_ready():
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return bool(os.environ.get('ANTHROPIC_API_KEY'))


def groq_ready():
    return bool(os.environ.get('GROQ_API_KEY'))


def ready():
    return claude_ready() or groq_ready()


def reply(question, context):
    if claude_ready():
        return claude_reply(question, context)
    return groq_reply(question, context)


def split(text):
    text = (text or '').strip()
    if not text:
        return {'ok': False, 'error': '빈 대답'}
    title, _, body = text.partition('\n')
    return {'ok': True, 'title': title.strip(), 'body': body.strip()}


def groq_reply(question, context):
    body = {
        'model': GROQ_MODEL,
        'messages': [
            {'role': 'system', 'content': CHAT_SYSTEM + '\n- 반드시 한국어로만 대답해.'},
            {'role': 'user', 'content': f'[상황]\n{json.dumps(context, ensure_ascii=False)}\n\n[질문]\n{question}'},
        ],
        'max_tokens': 400,
        'temperature': 0.7,
    }
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions', data=json.dumps(body).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + os.environ['GROQ_API_KEY'],
                 'User-Agent': 'jachul-api'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:   # 왜 거절됐는지(키 값은 안 들어 있음) 서버 로그에 남김
            err = json.loads(e.read().decode()).get('error', {})
            print(f"[groq] {e.code} {err.get('type', '')}: {str(err.get('message', ''))[:200]}", flush=True)
        except Exception:
            pass
        if e.code == 429:
            return {'ok': False, 'error': 'AI 호출이 너무 많아. 잠깐 뒤에 다시.'}
        return {'ok': False, 'error': f'AI 오류 {e.code}'}
    except (urllib.error.URLError, TimeoutError):
        return {'ok': False, 'error': 'AI 연결 실패'}
    return split(((data.get('choices') or [{}])[0].get('message') or {}).get('content', ''))


def claude_reply(question, context):
    import anthropic
    client = anthropic.Anthropic()
    try:
        resp = client.beta.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=16000,
            output_config={'effort': 'low'},             # 짧은 채팅이라 낮은 노력으로 빠르게
            betas=['server-side-fallback-2026-07-01'],   # 안전 분류기가 거절하면 다른 모델로 자동 재시도
            fallbacks='default',
            system=CHAT_SYSTEM,
            messages=[{'role': 'user', 'content':
                       f'[상황]\n{json.dumps(context, ensure_ascii=False)}\n\n[질문]\n{question}'}],
        )
    except anthropic.RateLimitError:
        return {'ok': False, 'error': 'Claude 호출이 너무 많아. 잠깐 뒤에 다시.'}
    except anthropic.AuthenticationError:
        return {'ok': False, 'error': 'Claude API 키가 안 맞아.'}
    except anthropic.APIStatusError as e:
        return {'ok': False, 'error': f'Claude 오류 {e.status_code}'}
    except anthropic.APIConnectionError:
        return {'ok': False, 'error': 'Claude 연결 실패'}
    if resp.stop_reason == 'refusal':
        return {'ok': False, 'error': 'Claude가 대답을 거절했어'}
    return split(''.join(b.text for b in resp.content if b.type == 'text'))
