# 쟈철

늦기 전에 먼저 보채는 지하철 에이전트 (Claude와 만든 8비트 픽셀 버전).
목표(어디서 → 어디로, 몇 시까지, 준비 시간) → 세팅 → 실시간으로 흐르는 원 + 쟈철 팝업.
회원은 로그인해서 내 경로를 저장한다. 9week_test의 Codex 앱(도착코치)과는 코드·DB 테이블 모두 따로다.

## 구조

| 폴더 | 배포 | 내용 |
| --- | --- | --- |
| `frontend/` | **Vercel** | `index.html`(화면 전부, 노선도 스냅샷 포함), `auth.mjs`(로그인·내 경로 동기화), `config.js`(주소·공개 키), `data/network.json` |
| `backend/` | **Render** | `app.py` API 서버: 실시간 도착정보 `subway.py`, (선택) Claude 채팅 `chat.py`. 키는 여기 환경변수에만 |
| `supabase/` | **Supabase** | `jachul_members`(회원 명부), `jachul_routes`(회원별 내 경로). RLS로 본인 것만 |
| `tools/` | — | 노선도 만들기 `build_network.py`, 명부 등록 `seed_members.py` |
| `legacy/` | — | 예전 한 파일 서버·아티팩트 빌드 (지금은 안 씀) |

`회원_명부.txt`(이름 TAB 이메일)는 개인정보라 `.gitignore`로 빼 둠. 절대 커밋하지 않는다.
화면 원본은 `9주차_2`(GitHub jachul-original)에서 고치고, 바뀌면 `frontend/index.html`로 가져온다
(가져올 때 `</head>` 앞 스크립트 3줄, `API(...)`, `jachul:routes` 연결은 유지).

## 로컬 실행

```bash
python3 backend/app.py      # http://127.0.0.1:5173 (프론트+API 같이, .env의 SEOUL_SUBWAY_KEY 쓰면 실시간)
```

## 로그인 흐름

1. 회원은 명부로 미리 등록돼 있다 (`jachul_members` + Supabase Auth 계정).
2. ★ 내 경로 창 맨 위 로그인 칸 → **처음 왔어? 비밀번호 만들기** → 이메일 입력 → 메일 링크를 누르면
   사이트로 돌아와 **새 비밀번호 정하기**가 뜬다. 비밀번호를 잊었을 때도 같은 방법.
3. 로그인하면 ★ 내 경로 목록이 `jachul_routes`에 저장되고 다른 기기와 합쳐진다.
4. 명부에 없는 계정으로 로그인하면 바로 로그아웃시킨다.

명부를 바꾸면: `.env`에 `SUPABASE_SERVICE_ROLE_KEY`를 넣고 `python3 tools/seed_members.py`.

## 배포

**Supabase** (한 번만, 대시보드)
- Authentication → URL Configuration: Site URL `https://jachul.vercel.app`, Redirect URLs에 `https://jachul.vercel.app/**`, `http://127.0.0.1:5173/**`
- Authentication → Sign In / Providers → **Allow new users to sign up 끄기**
- Authentication → Emails → **SMTP Settings**: 기본 메일 서버는 프로젝트 팀원에게만 보낸다. 회원 메일을 받으려면 Gmail·Resend 등 SMTP 연결 필요

**Render** (백엔드): New → Blueprint → 이 저장소 → `render.yaml` → `SEOUL_SUBWAY_KEY`(필수), `ANTHROPIC_API_KEY`(선택) 입력.
서비스 주소가 `https://jachul-api.onrender.com`이 아니면 `frontend/config.js`의 `apiBase`를 바꾼다.

**Vercel** (프론트): 푸시하면 자동 배포. 루트 `vercel.json`이 `frontend/`만 올린다.
