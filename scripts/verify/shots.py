"""화면 사진: python scripts/verify/shots.py [--danji]  →  screenshots/{first,result}_{pc1280,mobile390}.png · after_tabs_{notices,diag,settings,result,terms}_{…}.png
            · after_danji_{notices,danji}_{…}.png (단지 직접 공고가 섞인 공고 탭 = 실제 피드 + 가짜 엘리스 공고 · 단지 탭 = 실제 feed/danji.json) · --danji 면 이 둘만
임시 Chrome 프로필 + 테스트 서버(이 스크립트가 띄움). result 는 가짜 내 상황(scripts/verify/seed_subs.json)으로 판정한 화면.
"""
import json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import check as C   # 서버·경로 재사용 (불러오기만 하면 정적 검사 줄은 rows 에만 쌓이고 출력 안 함)

OUT = C.REPO / "screenshots"
def shot(name, w, h, seed=None, tall=None, hash_="", terms=True, ls=None, after=""):
    # 창 안에 w 폭 iframe 을 두고 찍은 뒤 w 만 잘라 낸다 (headless 창은 최소 폭이 있어서 390 창이 그대로 안 나온다)
    page, H = C.REPO / "_shot.html", tall or h
    js = "localStorage.clear();" + (f"localStorage.setItem('cheongyak-check-v1', {json.dumps(seed)});" if seed else "") + ("localStorage.setItem('cheongyak-check-terms', '2026-11-09');" if terms else "") + "".join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});" for k, v in (ls or {}).items())
    page.write_text(f"<!doctype html><meta charset=\"utf-8\"><style>body{{margin:0}}iframe{{border:0;display:block}}</style><script>{js}</script><iframe src=\"/index.html{hash_}\" width=\"{w}\" height=\"{H}\" onload=\"setTimeout(async () => {{ const fw = this.contentWindow; {after} }}, 1500)\"></iframe>", encoding="utf-8")
    try:
        with tempfile.TemporaryDirectory() as prof:
            subprocess.run([C.CHROME, "--headless=new", f"--user-data-dir={prof}", "--hide-scrollbars", "--virtual-time-budget=8000", f"--window-size={max(w, 800)},{H}",
                            f"--screenshot={OUT / name}", f"http://localhost:{C.NEW_PORT}/_shot.html"], capture_output=True, timeout=120)
    finally:
        page.unlink(missing_ok=True)
    from PIL import Image
    im = Image.open(OUT / name); im.crop((0, 0, w, H)).save(OUT / name)
    print(OUT / name)

# 단지 직접 공고(가짜 · 오늘 마감 1 · 민간임대 1 · 101개 단지 1)를 실제 피드에 섞고, 관심 단지(어바니엘 염창)는 ★ → 공고 탭 맨 위 띠
MIX = """const T = fw.eval('todayYmd()'), r = await (await fw.fetch('feed/notices.json')).json(), E = (id, title, kind, danji, region, to, from) => ({ id, org: '엘리스', title, region, kind, posted: T, from, to, time: '17:00', url: 'https://www.elyes.co.kr/post/recruit', direct: true, danji });
  fw.eval('setFeed')({ ...r, items: [E('elyes-s1', '[어바니엘 염창] 공실세대 모집공고 (접수기간: 11/6~11/9)', '민간임대', 'x-elyes-yeomchang', '서울 강서구', T, T),
    E('elyes-s2', '[용산원효루미니] 추가모집공고 (접수일 11/12)', '청년안심주택(민간)', '20000406', '서울 용산구', '2026-11-12', '2026-11-12'), ...r.items] });"""
DJ = {"cheongyak-check-danji-stars": '["x-elyes-yeomchang"]'}

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True); p = C.serve(C.NEW_PORT, C.REPO)
    try:
        for dev, w, h in [("pc1280", 1280, 800), ("mobile390", 390, 844)]:
            shot(f"after_danji_notices_{dev}.png", w, h, C.mine, tall=1300 if w > 400 else 1700, hash_="#notices", ls=DJ, after=MIX)
            shot(f"after_danji_danji_{dev}.png", w, h, C.mine, tall=1300 if w > 400 else 1700, hash_="#danji", ls=DJ)
            if "--danji" in sys.argv: continue
            shot(f"first_{dev}.png", w, h)
            shot(f"result_{dev}.png", w, h, C.mine, tall=2600 if w > 400 else 4200, hash_="#diag")
            for tab in ("notices", "diag", "settings"): shot(f"after_tabs_{tab}_{dev}.png", w, h, C.mine, hash_="#" + tab)
            shot(f"after_tabs_result_{dev}.png", w, h, C.mine, tall=1800 if w > 400 else 2600, hash_="#subJudge")
            shot(f"after_tabs_terms_{dev}.png", w, h, C.mine, hash_="#subJudge", terms=False)   # 이용약관 확인 카드 (처음 결과 볼 때)
    finally:
        p.terminate()
