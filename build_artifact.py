#!/usr/bin/env python3
"""index.html → claude.ai 아티팩트(공유 링크)용 한 파일로 만든다.

아티팩트는 외부 스타일시트를 못 불러와서 픽셀 폰트(갈무리, OFL)를 파일 안에 넣고,
html/head/body 껍데기는 아티팩트가 씌우니까 뺀다. 나머지는 index.html 그대로.

    python3 build_artifact.py        # → dist/jansori.html
"""
import base64
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
FONT_CDN = "https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/"
FONTS = [("Galmuri11", 400, "Galmuri11.woff2"), ("Galmuri11", 700, "Galmuri11-Bold.woff2"),
         ("GalmuriMono11", 400, "GalmuriMono11.woff2")]


def font_face(family, weight, filename):
    path = os.path.join(DIST, "fonts", filename)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urllib.request.urlopen(FONT_CDN + filename, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    data = base64.b64encode(open(path, "rb").read()).decode()
    return (f"@font-face{{font-family:{family};font-weight:{weight};font-display:swap;"
            f"src:url(data:font/woff2;base64,{data}) format('woff2')}}")


def main():
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    # 껍데기 태그 빼기 (아티팩트가 doctype/head/body를 씌움)
    for pat in [r"<!doctype html>\s*", r"<html[^>]*>\s*", r"</html>\s*", r"<head>\s*", r"</head>\s*",
                r"<body>\s*", r"</body>\s*", r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*']:
        html = re.sub(pat, "", html, flags=re.I)
    # 폰트: 외부 스타일시트 대신 파일 안에
    html = re.sub(r'<link href="https://cdn\.jsdelivr\.net/npm/galmuri[^"]*" rel="stylesheet">\s*', "", html)
    faces = "\n".join(font_face(*f) for f in FONTS)
    html = html.replace("<style>", "<style>\n" + faces + "\n", 1)
    # 제목 옆에: 옆 여백이 안전 영역(max) 패딩이라는 표시
    html = html.replace("</title>", '</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1)
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "jansori.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html.strip() + "\n")
    print(f"저장: {out} ({os.path.getsize(out) // 1024}KB)")


if __name__ == "__main__":
    main()
