"""(선택) 채팅에 Claude 연결. anthropic 패키지와 ANTHROPIC_API_KEY 가 있으면 켜지고, 없으면 화면이 내장 대답을 씀."""
import json
import os

CLAUDE_MODEL = os.environ.get('CLAUDE_MODEL', 'claude-opus-5-5')
CHAT_SYSTEM = """너는 '쟈철'이라는 지하철 지각 방지 앱의 에이전트야. 사용자가 늦지 않게 보채는 게 일이야.
- 말투: 반말. 솔직하고 짧게, 2~3문장. 돌려 말하지 말고 지금 해야 할 행동을 말해.
- 시각·열차·몇 분 늦는지는 [상황]에 있는 값만 써. 없는 정보는 지어내지 말고 모른다고 해.
- 지하철·출발과 상관없는 질문이면 한 마디로 받아치고 출발 얘기로 돌아와.
- 형식: 첫 줄은 20자 이내 한 마디, 둘째 줄부터 설명. 마크다운 쓰지 마."""


def ready():
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return bool(os.environ.get('ANTHROPIC_API_KEY'))


def reply(question, context):
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
    text = ''.join(b.text for b in resp.content if b.type == 'text').strip()
    if not text:
        return {'ok': False, 'error': '빈 대답'}
    title, _, body = text.partition('\n')
    return {'ok': True, 'title': title.strip(), 'body': body.strip()}
