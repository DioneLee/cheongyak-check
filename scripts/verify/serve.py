"""테스트 전용 서버: python scripts/verify/serve.py [포트=8766] [폴더=레포 루트]
/__offline/on 을 부르면 그 뒤 요청은 모두 503 (오프라인 흉내 · 서비스 워커 저장본 검사용), /__offline/off 로 되돌림.
/__pages/on: Cloudflare Pages 흉내 (/x.html → 308 /x · /index.html → 308 / · /x 는 x.html) · /__sw?f=파일: /sw.js 대신 그 파일 (옛 서비스 워커 검사).
"""
import json, sys, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[2]
OFF = {"on": False}; PAGES = {"on": False}; SW = {"f": None}
DONE = threading.Event()   # /__wait 는 /__done 이 올 때까지 붙잡는다 → Chrome --dump-dom 이 검사 끝까지 기다림 (가상 시간 없이)
HITS = {}   # 경로별 요청 수 (/__hits) — 서비스 워커가 인터넷 먼저/저장본 먼저로 받는지 검사

class H(SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0]
        if p.startswith("/__offline/"):
            OFF["on"] = p.endswith("/on"); self.send_response(204); self.end_headers(); return
        if p.startswith("/__pages/"):
            PAGES["on"] = p.endswith("/on"); self.send_response(204); self.end_headers(); return
        if p == "/__sw":
            from urllib.parse import parse_qs, urlparse
            SW["f"] = (parse_qs(urlparse(self.path).query).get("f") or [None])[0]; self.send_response(204); self.end_headers(); return
        if p == "/__wait":
            DONE.clear(); DONE.wait(180); self.send_response(204); self.end_headers(); return
        if p == "/__done":
            DONE.set(); self.send_response(204); self.end_headers(); return
        if p == "/__hits":
            b = json.dumps(HITS).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b); return
        HITS[p] = HITS.get(p, 0) + 1
        if OFF["on"]:
            self.send_response(503); self.end_headers(); return
        if p == "/sw.js" and SW["f"]:
            b = Path(SW["f"]).read_bytes(); self.send_response(200); self.send_header("Content-Type", "application/javascript"); self.end_headers(); self.wfile.write(b); return
        if PAGES["on"]:
            if p.endswith(".html"):
                self.send_response(308); self.send_header("Location", p[:-len("index.html")] if p.endswith("/index.html") else p[:-5]); self.end_headers(); return
            if p != "/" and "." not in p.rsplit("/", 1)[-1] and (ROOT / (p.lstrip("/") + ".html")).is_file():
                self.path = p + ".html"
        super().do_GET()
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def log_message(self, *a): pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    ThreadingHTTPServer(("localhost", port), partial(H, directory=str(ROOT))).serve_forever()
