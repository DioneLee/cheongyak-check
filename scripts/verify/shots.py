"""화면 사진: python scripts/verify/shots.py  →  screenshots/{first,result}_{pc1280,mobile390}.png
임시 Chrome 프로필 + 테스트 서버(이 스크립트가 띄움). result 는 가짜 내 상황(scripts/verify/seed_subs.json)으로 판정한 화면.
"""
import json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import check as C   # 서버·경로 재사용 (불러오기만 하면 정적 검사 줄은 rows 에만 쌓이고 출력 안 함)

OUT = C.REPO / "screenshots"
def shot(name, w, h, seed=None, tall=None):
    # 창 안에 w 폭 iframe 을 두고 찍은 뒤 w 만 잘라 낸다 (headless 창은 최소 폭이 있어서 390 창이 그대로 안 나온다)
    page, H = C.REPO / "_shot.html", tall or h
    js = "localStorage.clear();" + (f"localStorage.setItem('cheongyak-check-v1', {json.dumps(seed)});" if seed else "")
    page.write_text(f"<!doctype html><style>body{{margin:0}}iframe{{border:0;display:block}}</style><script>{js}</script><iframe src=\"/index.html\" width=\"{w}\" height=\"{H}\"></iframe>", encoding="utf-8")
    try:
        with tempfile.TemporaryDirectory() as prof:
            subprocess.run([C.CHROME, "--headless=new", f"--user-data-dir={prof}", "--hide-scrollbars", "--virtual-time-budget=8000", f"--window-size={max(w, 800)},{H}",
                            f"--screenshot={OUT / name}", f"http://localhost:{C.NEW_PORT}/_shot.html"], capture_output=True, timeout=120)
    finally:
        page.unlink(missing_ok=True)
    from PIL import Image
    im = Image.open(OUT / name); im.crop((0, 0, w, H)).save(OUT / name)
    print(OUT / name)

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True); p = C.serve(C.NEW_PORT, C.REPO)
    try:
        for dev, w, h in [("pc1280", 1280, 800), ("mobile390", 390, 844)]:
            shot(f"first_{dev}.png", w, h)
            shot(f"result_{dev}.png", w, h, C.mine, tall=2600 if w > 400 else 4200)
    finally:
        p.terminate()
