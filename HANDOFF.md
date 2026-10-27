# 잔소리역 인수인계

지하철 지각 방지 웹앱. 목적지·도착 시간·준비 시간을 넣으면 언제 준비하고 나가야 하는지 반말로 보채는 에이전트.
Claude Code에서 만들었고, 이 문서는 이어서 작업할 Codex를 위한 요약이다.

## 실행

```sh
python3 server.py          # http://localhost:5173  (표준 라이브러리만 사용)
python3 build_network.py --crawl   # 노선도 다시 만들기 (지하철 운행 시간에, .env의 SEOUL_SUBWAY_KEY 필요)
python3 build_artifact.py  # 공유 링크용 dist/jansori.html 만들기
```

`.env`에 서울시 실시간 지하철 키가 들어 있다. 커밋하지 않는다(`.gitignore`). 브라우저로 키를 내보내지 않는 구조를 유지한다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `index.html` | 화면 전부 (HTML·CSS·JS 한 파일, 전체 노선도 스냅샷 포함). 대부분의 작업은 여기서 한다 |
| `server.py` | 페이지 제공 + 서울시 실시간 도착정보 프록시 (`/api/status`, `/api/arrivals`, 선택 `/api/chat`) |
| `build_network.py` | 실시간 API로 전체 노선도 생성 → `data/network.json`과 `index.html` 안 스냅샷 갱신 |
| `lines.py` | 노선 색·역간 소요·배차 간격·첫차/막차 |
| `build_artifact.py` | `index.html` → `dist/jansori.html` (픽셀 폰트를 파일 안에 넣음) |
| `data/` | 노선도(`network.json`), 역별 탐색 캐시 |

## 화면 구성 (`index.html`)

위에서부터: 목표 카드(출발역·도착역·도착 시각·준비 시간) → 에이전트 채팅(아바타 열차 캐릭터, 질문 칩, 직접 묻기, 늦으면 알림) → 돌려봐 원 다이얼(최대 60분, '더 늦을지도;'로 3시간) → 이렇게 가(환승 포함 경로, GPS 따라 달리는 8비트 캐릭터, 누르면 꾸미기 팝업) → 지금 오는 열차(픽셀 열차 캐릭터, 실시간).

## 사용자 취향 (지켜야 할 것)

- 말투: 반말, 솔직하고 짧게, 지금 할 행동을 말한다 ("신발 신어.", "너 개늦는다.").
- 디자인: 8비트 픽셀 (갈무리 폰트, 계단 모서리 박스, 검정 그림자). 색 그림자·하이라이트는 촌스럽다고 뺐다.
- 목표(어디를 몇 시까지)가 항상 맨 위에 보여야 한다.
- 바뀔 때마다 커밋한다. 메시지는 한국어.
- 돌아갈 지점: 태그 `처음모습` (픽셀 캐릭터 작업 전).

## 공유 링크

https://claude.ai/artifact/RioLNy6THNkz4drunYxNcs (claude.ai 아티팩트, 소유자만 열림. 공개는 페이지의 공유 메뉴에서)
서버가 없어서 실시간 열차는 추정, GPS는 안 됨. 채팅 입력칸은 아티팩트 안에서 Claude에 직접 물어본다.

## 남은 일

- 실제 호스팅(HTTPS) 배포: 폰에서 GPS·실시간 열차까지 되게.
- 노선도 추정 6개 역(광명·서동탄·별내별가람·오남·진접·임진강)을 낮에 `build_network.py --crawl`로 실제 값으로.
- 채팅 Claude 연결(서버 쪽): Python 3.10+ `pip install -r requirements.txt` + `.env`에 `ANTHROPIC_API_KEY`.
