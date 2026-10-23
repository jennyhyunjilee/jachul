# 잔소리역

늦기 전에 먼저 보채는 지하철 에이전트. 목적지·도착 시간·준비 시간을 넣으면
서울시 실시간 지하철 도착정보로 "언제 준비하고 언제 나가야 하는지"를 반말로 보챈다.

## 실행

1. [서울 열린데이터광장](https://data.seoul.go.kr)에서 **실시간 지하철 인증키**를 발급받는다.
2. `.env.example`을 `.env`로 복사하고 키를 넣는다.
3. 전체 노선도 만들기 (운행 시간에 한 번):

   ```bash
   python3 build_network.py
   ```

4. 서버 실행 후 http://localhost:5173

   ```bash
   python3 server.py
   ```

## 서버에 올리기

| 올리는 방법 | 되는 것 |
|---|---|
| `index.html` 하나만 (정적 호스팅) | 전체 노선·경로·보채기 전부. 열차 시각은 배차 간격으로 **추정** |
| 폴더 전체 + `python3 server.py` (+ `.env`) | 위에 더해 **실시간 열차 위치·도착 시각** |

`index.html` 안에 전체 노선도가 들어 있어서 파일 하나만 올려도 된다
(`build_network.py`를 돌리면 자동으로 갱신됨).
실시간은 API 키를 숨겨야 하고 서울시 API가 http라서, 브라우저가 직접 못 부르고 서버(`server.py`)가 꼭 필요하다.


## (선택) 채팅에 Claude 연결

채팅창에 직접 쓴 질문을 Claude가 상황(목표·계획·경로)을 보고 반말로 대답한다.
없으면 내장 대답(키워드 매칭 + 여러 말투)으로 동작한다.

1. Python 3.10 이상에서 `pip install -r requirements.txt`
2. `.env`에 `ANTHROPIC_API_KEY=...` 추가 (console.anthropic.com 에서 발급, 사용량만큼 과금)
3. `python3 server.py` 다시 실행 → 시작 메시지에 "Claude 채팅 켜짐"

모델은 `claude-opus-5-5` (effort low), 바꾸려면 `.env`에 `CLAUDE_MODEL=...`.

## 구조

- `index.html`: 화면 전부 (목표 카드 · 에이전트 · 다이얼 · 경로 · 실시간 열차)
- `server.py`: 페이지 제공 + 실시간 API 프록시 (키는 서버에만 있음, 역별 20초 캐시)
- `build_network.py`: 실시간 도착정보(일괄)의 이전역/다음역으로 전체 노선도 생성 → `data/network.json`
- `lines.py`: 노선 색·평균 소요·배차 간격
