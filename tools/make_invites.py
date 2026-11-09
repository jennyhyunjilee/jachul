"""회원마다 1회용 가입 코드 만들기.

  python3 tools/make_invites.py                 # 명부의 모든 회원에게 새 코드
  python3 tools/make_invites.py a@b.com c@d.com # 이 사람들만 새 코드 (비밀번호 잊었을 때)

- 진짜 코드는 가입코드_명부.txt 에만 쓴다. 이 파일은 .gitignore·.vercelignore의 *명부*.txt 라서
  깃에도 배포에도 안 올라간다. 회원한테는 이 파일 보고 각자 코드만 따로 알려주면 된다.
- 화면에 찍는 SQL(그리고 --sql 파일)엔 코드도 이메일도 없고 해시만 있다.
  그 SQL을 Supabase SQL 편집기에서 돌리면 등록 끝. 새 코드를 만들면 그 사람 예전 코드는 무효.
"""
import hashlib
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "회원_명부.txt"
OUT = ROOT / "가입코드_명부.txt"
ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # 헷갈리는 0/O, 1/I/L 뺌

sha = lambda s: hashlib.sha256(s.encode()).hexdigest()


def main(argv):
    sql_path = None
    if "--sql" in argv:
        i = argv.index("--sql"); sql_path = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    roster = {}
    for line in ROSTER.read_text(encoding="utf-8").splitlines():
        m = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", line)
        if m:
            roster[m.group().lower()] = line.replace(m.group(), "").strip()
    want = [a.lower() for a in argv] or list(roster)
    missing = [e for e in want if e not in roster]
    if missing:
        sys.exit(f"명부에 없는 이메일: {len(missing)}개. 회원_명부.txt 먼저 고쳐.")

    old = {}
    if OUT.exists():
        for line in OUT.read_text(encoding="utf-8").splitlines():
            p = line.split("\t")
            if len(p) >= 2 and "@" in p[0]:
                old[p[0].lower()] = line
    rows, sql = {}, []
    for e in want:
        code = "".join(secrets.choice(ABC) for _ in range(8))
        salt = secrets.token_hex(16)
        rows[e] = f"{e}\t{code[:4]}-{code[4:]}\t{roster[e]}"
        sql.append(f"('{sha(e)}','{salt}','{sha(salt + code)}')")
    merged = {**old, **rows}
    OUT.write_text("# 쟈철 가입 코드 (1회용). 절대 깃·카톡방 공개 금지. 각자한테 따로 알려줘.\n"
                   "# 이메일\t가입코드\t이름\n" + "\n".join(merged.values()) + "\n", encoding="utf-8")
    OUT.chmod(0o600)

    q = ("insert into public.jachul_invites (email_sha, salt, code_hash) values\n  " + ",\n  ".join(sql) +
         "\non conflict (email_sha) do update set salt = excluded.salt, code_hash = excluded.code_hash,"
         " fails = 0, used_at = null, created_at = now();")
    if sql_path:
        Path(sql_path).write_text(q, encoding="utf-8")
    else:
        print(q)
    print(f"-- 코드 {len(rows)}개 → {OUT.name} (깃 제외)", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
