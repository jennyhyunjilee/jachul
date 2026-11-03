# 쟈철

늦기 전에 먼저 보채는 지하철 에이전트. 목적지·도착 시간·준비 시간을 넣으면
언제 준비하고 언제 나가야 하는지 반말로 알려준다. 회원은 로그인해서 내 경로를 저장한다.

## 구조

| 폴더 | 배포 | 내용 |
| --- | --- | --- |
| `frontend/` | **Vercel** | 화면 전부 (index.html, app.js, *.mjs, 노선도 `data/network.json`), 로그인 `auth.mjs`, 주소 설정 `config.js` |
| `backend/` | **Render** | API 서버 `app.py` (음성 → 목표: OpenAI 프록시 `ai_proxy.py`). 키는 여기 환경변수에만 |
| `supabase/` | **Supabase** | DB 마이그레이션: `members`(회원 명부), `user_routes`(회원별 저장 경로). 둘 다 RLS로 본인 것만 |
| `tools/` | — | 노선도 만들기 `build_network.py`, 회원 명부 등록 `seed_members.py` |
| `tests/` | — | `npm test` |
| `legacy/` | — | 예전 한 파일 버전용 서버·빌드 (지금은 안 씀) |

`회원_명부.txt`(이름 TAB 이메일)는 개인정보라 `.gitignore`로 빼 둠. 절대 커밋하지 않는다.

## 로컬 실행

```bash
python3 backend/app.py      # http://127.0.0.1:5183 (프론트+API 같이)
npm test
```

## 로그인 흐름

1. 회원은 명부로 미리 등록돼 있다 (`members` + Supabase Auth 계정).
2. 처음 온 회원: 로그인 → **처음 왔어? 비밀번호 만들기** → 이메일 입력 → 메일 링크를 누르면
   사이트로 돌아와 **새 비밀번호 정하기** 창이 뜬다. 비밀번호를 잊었을 때도 같은 방법.
3. 로그인하면 즐겨찾기·자주 가는 일정이 `user_routes`에 저장되고, 다른 기기에서도 같이 보인다.
4. 명부(`members`)에 없는 계정으로 로그인하면 바로 로그아웃시킨다.

명부를 바꾸면: `.env`에 `SUPABASE_SERVICE_ROLE_KEY`를 넣고 `python3 tools/seed_members.py`
(새 회원 계정을 비밀번호 없이 만들고, 메일은 보내지 않음).

## 배포

**Supabase** (한 번만, 대시보드에서)
- Authentication → URL Configuration: Site URL `https://jachul.vercel.app`, Redirect URLs에 `https://jachul.vercel.app/**`, `http://127.0.0.1:5183/**` 추가
- Authentication → Sign In / Providers → **Allow new users to sign up 끄기** (명부 회원만)
- Authentication → Emails → **SMTP Settings**: 기본 메일 서버는 프로젝트 팀원에게만 메일을 보낸다.
  회원들이 비밀번호 메일을 받으려면 Gmail·Resend 같은 SMTP를 연결해야 한다.

**Render** (백엔드)
- New → Blueprint → 이 저장소 선택 → `render.yaml` 그대로 → `OPENAI_API_KEY` 입력
- 서비스 이름이 `jachul-api`가 아니면 `frontend/config.js`의 `apiBase` 주소를 바꾼다.

**Vercel** (프론트)
- GitHub 연결돼 있으면 푸시하면 자동 배포. 루트 `vercel.json`이 `frontend/`만 올린다.
