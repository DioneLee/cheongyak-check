"""CSP 브라우저 검사 (2026-11-12): _headers 머리를 그대로 붙여 주는 테스트 서버 + 임시 Chrome 프로필로 화면들을 열고
'Content Security Policy' 로 막힌 것(스크립트·연결)이 0건인지, 화면이 실제로 그려졌는지, 일부러 넣은 인라인 스크립트는 막히는지 본다.
사용: python scripts/verify/csp_check.py      (서버는 이 스크립트가 띄우고 끈다 · 포트 8797)
"""
import http.server, json, re, subprocess, sys, tempfile, threading
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 8797
VISITS = [("/#notices", 'data-fid="', "공고 탭 (피드 목록)"), ("/#danji", 'data-did="', "단지 탭"), ("/#diag", 'id="subWiz"', "진단 탭"), ("/terms.html", "이용약관", "이용약관"), ("/privacy.html", "개인정보", "개인정보")]

def rules():   # _headers → [(경로 패턴, [(이름, 값)])]
    out, cur = [], None
    for ln in (REPO / "_headers").read_text(encoding="utf-8").splitlines():
        if not ln.strip() or ln.lstrip().startswith("#"): continue
        if not ln.startswith(" "): cur = (ln.strip(), []); out.append(cur)
        elif cur: k, v = ln.strip().split(":", 1); cur[1].append((k.strip(), v.strip()))
    return out

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=str(REPO), **k)
    def log_message(s, *a): pass
    def end_headers(s):
        path = s.path.split("?")[0]
        for pat, hs in rules():
            if pat == path or (pat.endswith("*") and path.startswith(pat[:-1])):
                for k, v in hs: s.send_header(k, v)
        super().end_headers()
    def do_GET(s):
        if s.path.startswith("/__csp_probe.html"):   # 일부러 넣은 인라인 스크립트: CSP 가 살아 있으면 실행되지 않아야 함
            b = b'<!doctype html><meta charset="utf-8"><body><p id="r">blocked</p><script>document.getElementById("r").textContent = "ran"</script>'
            s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.end_headers(); s.wfile.write(b); return
        if s.path.endswith(".html") or s.path.split("?")[0] == "/":   # 배포(git, LF)와 같게 LF 로 내보냄
            f = REPO / (s.path.split("?")[0].lstrip("/") or "index.html")
            if f.exists():
                b = f.read_bytes().replace(b"\r\n", b"\n"); s.send_response(200); s.send_header("Content-Type", "text/html; charset=utf-8"); s.send_header("Content-Length", str(len(b))); s.end_headers(); s.wfile.write(b); return
        super().do_GET()

def main():
    rows = []
    r = subprocess.run([sys.executable, str(REPO / "scripts" / "csp.py")], capture_output=True, text=True, encoding="utf-8")
    rows.append(("OK" if r.returncode == 0 else "NG", "_headers 의 CSP 해시가 지금 인라인 스크립트와 같음", r.stdout.strip()))
    srv = http.server.ThreadingHTTPServer(("localhost", PORT), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        for path, must, label in VISITS + [("/__csp_probe.html", 'id="r">blocked<', "일부러 넣은 인라인 스크립트는 막힘 (CSP 가 실제로 걸림)")]:
            with tempfile.TemporaryDirectory() as prof:
                p = subprocess.run([CHROME, "--headless=new", f"--user-data-dir={prof}", "--enable-logging=stderr", "--v=0", "--virtual-time-budget=15000", "--window-size=1280,900",
                                    "--dump-dom", f"http://localhost:{PORT}{path}"], capture_output=True, timeout=180)
            dom, err = p.stdout.decode("utf-8", "replace"), p.stderr.decode("utf-8", "replace")
            csp = [l[l.find('"'):][:220] for l in err.splitlines() if "CONSOLE" in l and re.search(r"Content Security Policy|Refused to", l)]
            other = [l[l.find('"'):][:220] for l in err.splitlines() if "CONSOLE" in l and ("Uncaught" in l or "Assertion failed" in l)]
            if path == "/__csp_probe.html":
                rows.append(("OK" if must in dom and csp else "NG", label, f"막힘 알림 {len(csp)}건"))
            else:
                rows.append(("OK" if not csp and not other and must in dom else "NG", f"{path} · {label} · CSP 로 막힌 것 0 · 오류 0", " | ".join(csp + other) or ("" if must in dom else f"화면에 '{must}' 없음")))
    finally:
        srv.shutdown()
    for st, n, g in rows: print(f"{st}  {n}" + (f"  → {g}" if g else ""))
    bad = sum(1 for x in rows if x[0] != "OK"); print(f"\n{len(rows) - bad}/{len(rows)} OK"); sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
