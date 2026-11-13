"""CSP(Content-Security-Policy) 해시 맞추기 — 인라인 <script> 내용의 sha256 을 _headers 에 넣는다 (2026-11-12).
정적 사이트라 요청마다 바뀌는 nonce 는 못 쓰고 해시를 쓴다. 인라인 스크립트를 한 글자라도 고치면 해시가 바뀐다:
  python scripts/csp.py           # 검사만: _headers 의 CSP 가 지금 파일과 같은지 (다르면 1로 끝남 · 검사 스크립트가 부른다)
  python scripts/csp.py --write   # _headers 의 CSP 줄을 지금 파일에 맞게 고침
해시는 줄바꿈을 LF 로 맞춰 계산한다 (배포되는 git 내용이 LF · .gitattributes 로 작업 폴더도 LF).
"""
import base64, hashlib, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ["index.html", "terms.html", "privacy.html"]
SCRIPT_HOSTS = ["https://cdnjs.cloudflare.com"]   # 이 사이트(lib/feed-tools.js) + 지도(Leaflet, 지도를 열 때만) · 글꼴 CSS 는 style 이라 따로 안 막음
CONNECT = ["https://suitable-home-ai.demolee.workers.dev", "https://generativelanguage.googleapis.com", "https://nominatim.openstreetmap.org"]   # AI Worker · 내 키(고급 설정) · 주소 검색 · 피드는 이 사이트(self)

def inline_hashes():
    out = []
    for f in PAGES:
        t = (ROOT / f).read_bytes().replace(b"\r\n", b"\n").decode("utf-8")
        for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", t, re.S):
            out.append("'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode() + "'")
    return out

def policy():
    return "; ".join([" ".join(["script-src 'self'", *SCRIPT_HOSTS, *inline_hashes()]), "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", " ".join(["connect-src 'self'", *CONNECT])])

HEAD = ["  Content-Security-Policy: ", "  X-Content-Type-Options: nosniff", "  Referrer-Policy: strict-origin-when-cross-origin"]

def wanted(text):
    lines = text.replace("\r\n", "\n").split("\n")
    block = ["/*", HEAD[0] + policy(), HEAD[1], HEAD[2]]
    if "/*" in lines:   # 이미 있으면 그 블록을 바꿈
        i = lines.index("/*"); j = i + 1
        while j < len(lines) and lines[j].startswith("  "): j += 1
        lines[i:j] = block
    else:
        while lines and lines[-1] == "": lines.pop()
        lines += ["# 모든 응답: CSP(스크립트는 이 사이트 + 쓰는 CDN + 인라인 해시만 · scripts/csp.py 가 맞춤) · 형식 추측 금지 · 다른 사이트로는 출처(도메인)만", *block]
    return "\n".join(lines).rstrip("\n") + "\n"

if __name__ == "__main__":
    p = ROOT / "_headers"; cur = p.read_text(encoding="utf-8") if p.exists() else ""
    new = wanted(cur)
    if "--write" in sys.argv:
        p.write_bytes(new.encode("utf-8")); print("_headers 고침:", len(inline_hashes()), "개 인라인 스크립트 해시")
    elif cur.replace("\r\n", "\n") != new:
        print("CSP 가 지금 파일과 달라요 → python scripts/csp.py --write"); sys.exit(1)
    else:
        print("CSP 해시 같음 (인라인 스크립트", len(inline_hashes()), "개)")
