"""청약 체크 자동 검사 — 임시 Chrome 프로필 + localhost 테스트 서버 (실제 저장 데이터와 섞이지 않음)

사용: python scripts/verify/check.py            (서버는 이 스크립트가 띄우고 끝나면 끈다)
  1) 정적 검사: 기존 저장 키에 쓰기 없음 · API 키 없음 · 방문자 분석 도구 없음 · sw.js VERSION
  2) 기능 (PC 1280): 첫 화면 · 2단 · 질문 · 예시 공고 · 아코디언 · 문구 · 저장 · 피드 5개 · AI PDF 읽기 · 내보내기/불러오기
  3) 휴대폰 390: 첫 화면 · 가로 넘침 · 같은 저장 공간 가져오기(원본 그대로) · SUITABLE HOME 파일 불러오기
  4) 판정 동등성: 같은 내 상황을 SUITABLE HOME(../sjcu)과 이 사이트에 넣고 결과 글자 비교 (시나리오 7 × 신혼부부·청년)
  5) 서비스 워커: index.html·피드는 인터넷 먼저 · 아이콘은 저장본 · 서버가 꺼져도 저장본으로 열림
"""
import os, hashlib, json, re, socket, subprocess, sys, tempfile, time, urllib.parse
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
REPO = Path(__file__).resolve().parents[2]
OLD_REPO = REPO.parent / "sjcu"
CHROME = os.environ.get("CHROME") or (r"C:\Program Files\Google\Chrome\Application\chrome.exe" if os.name == "nt" else "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
NEW_PORT = int(os.environ.get("CHECK_PORT", 8766)); OLD_PORT = NEW_PORT + 1   # 포트가 겹치면 CHECK_PORT=8790 처럼 바꿔 실행
SEED = json.loads((REPO / "scripts/verify/seed_subs.json").read_text(encoding="utf-8"))   # 가짜 값 (SUITABLE HOME seed_v10 과 같은 사람)
rows = []
def ok(name, cond, got=""): rows.append(("OK" if cond else "NG", name, str(got)))

# ---------- 1) 정적 검사 ----------
src = (REPO / "index.html").read_text(encoding="utf-8")
ok("기존 저장 키(newlywed-home-v1)는 읽기만", src.count("newlywed-home-v1") == 1 and not re.search(r"(setItem|removeItem)\(\s*OLD_KEY", src) and src.count("OLD_KEY") == 2, src.count("OLD_KEY"))
tracked = [p for p in REPO.rglob("*") if p.is_file() and ".git" not in p.parts and p.suffix in {".html", ".js", ".mjs", ".json", ".yml", ".md", ".py", ".webmanifest"}]
ok("API 키(AIza…) 없음", not any("AIza" in p.read_text(encoding="utf-8", errors="ignore") for p in tracked if p.name != "check.py"))
ok("방문자 분석·광고 도구 없음", not re.search(r"googletagmanager|gtag\(|google-analytics|clarity\.ms|hotjar|mixpanel|amplitude|plausible", src))
try:
    changed = subprocess.run(["git", "-C", str(REPO), "diff", "--name-only", "HEAD"], capture_output=True, text=True).stdout.split()
    ok("index.html·아이콘·예시를 바꿨으면 sw.js VERSION 도 바꿈", not any(c.startswith(("index.html", "icons/", "samples/", "manifest")) for c in changed) or "sw.js" in changed, changed)
except Exception as e:
    ok("git 확인 (처음 커밋 전이면 건너뜀)", True, e)

# ---------- 브라우저 실행 도우미 ----------
HARNESS = """const W = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (n, c, g) => { out.push([c ? 'OK' : 'NG', n, String(g ?? '')]); document.title = 'after: ' + n; };
let f, d, fw; const errs = [];
async function open(hash) { if (f) f.remove(); f = document.createElement('iframe'); f.style.cssText = 'border:0;width:%(w)dpx;height:%(h)dpx'; f.src = '%(page)s' + (hash || ''); document.body.append(f);
  await new Promise(r => f.onload = r); await W(1200); d = f.contentDocument; fw = f.contentWindow; d.documentElement.style.scrollBehavior = 'auto'; fw.addEventListener('error', e => errs.push(e.message)); }
(async () => { localStorage.clear(); const SEEDS = %(seeds)s; for (const k in SEEDS) localStorage.setItem(k, SEEDS[k]);
 await open(%(hash)s);
 %(body)s
 ok('page errors', !errs.length, errs.join(' | '));
 document.body.innerHTML = '<pre id="r">' + encodeURIComponent(JSON.stringify(out)) + '</pre>';
})().catch(e => { document.body.innerHTML = '<pre id="r">' + encodeURIComponent(JSON.stringify([['NG', 'script error', e.message + ' ' + e.stack]])) + '</pre>'; }).finally(() => fetch('/__done?' + Date.now()).catch(() => {}));"""

def run(body, root, port, page, w=1280, h=800, seeds=None, hash_="", budget=60000):
    hp = root / ("_check.html" if root == REPO else "screenshots/process/_check_new.html")
    hp.parent.mkdir(parents=True, exist_ok=True)
    js = HARNESS % {"w": w, "h": h, "page": page, "seeds": json.dumps(seeds or {}, ensure_ascii=False), "hash": json.dumps(hash_), "body": body}
    hold = '<img src="/__wait" alt="">' if budget is None else ''   # 가상 시간 없이: 서버가 /__done 까지 붙잡아 load 를 늦춘다
    hp.write_text('<!doctype html><meta charset="utf-8"><body>' + hold + '<script>' + js + "</script>", encoding="utf-8")
    try:
        with tempfile.TemporaryDirectory() as prof:
            r = subprocess.run([CHROME, "--headless=new", f"--user-data-dir={prof}", "--enable-logging=stderr", "--v=0", *([f"--virtual-time-budget={budget}"] if budget else []), "--window-size=1400,1000",
                                "--dump-dom", f"http://localhost:{port}/{hp.relative_to(root).as_posix()}"], capture_output=True, timeout=240)
    finally:
        hp.unlink(missing_ok=True)
    dom = r.stdout.decode("utf-8", "replace"); m = re.search(r'<pre id="r">([^<+]*)</pre>', dom)
    res = json.loads(urllib.parse.unquote(m.group(1))) if m else [["NG", "끝나지 않음 (시간 초과)", (re.search(r"<title>(.*?)</title>", dom) or [None, "시작 전"])[1]]]
    logs = [l for l in r.stderr.decode("utf-8", "replace").splitlines() if "CONSOLE" in l and ("Assertion" in l or "Uncaught" in l)]
    return res, logs

def serve(port, root):
    for host in ("127.0.0.1", "::1"):   # localhost 가 IPv6 로 다른 서버에 붙는 일을 막는다
        try: socket.create_connection((host, port), 0.2).close(); raise SystemExit(f"포트 {port} 를 다른 서버가 쓰고 있어요 ({host}). 끄고 다시 실행해 주세요.")
        except OSError: pass
    p = subprocess.Popen([sys.executable, str(REPO / "scripts/verify/serve.py"), str(port), str(root)])
    for _ in range(50):
        try: socket.create_connection(("localhost", port), 0.2).close(); return p
        except OSError: time.sleep(0.1)
    raise SystemExit(f"서버 {port} 를 띄우지 못했어요 (이미 쓰는 중?)")

NEW_KEY = "cheongyak-check-v1"
mine = json.dumps({"subs": SEED["subs"], "settings": SEED["settings"]}, ensure_ascii=False)
old_seed = json.dumps({**SEED, "listings": []}, ensure_ascii=False)   # 가짜 SUITABLE HOME 데이터 (매물 없이 청약만)

PC = r"""
const q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
ok('기존 데이터 없으면 가져오기 숨김', q('#importBanner').hidden);
ok('맨 위는 서울 진행중 공고 (원문 사이트 4곳)', q('h1').textContent.includes('진행중 공고') && qa('#linksSec .src-grid a[target="_blank"]').length === 4 && q('#linksSec').getBoundingClientRect().top < q('#subsSec').getBoundingClientRect().top);
ok('PC 한 줄 기둥 (880px)', getComputedStyle(q('#subsSec')).maxWidth === '880px' && getComputedStyle(q('#linksSec')).maxWidth === '880px');
ok('자체검사 함수가 실행됨(판정 코드 옮김)', typeof fw.eval('elig') === 'function' && typeof fw.eval('pickOption') === 'function');
ok('진단 제목 바로 밑에 PDF 올리기 + 질문 (안내 카드 없음)', q('#h-diag').textContent.includes('순위·점수') && !q('#subAdd').hidden && !!q('#subAdd #subPdf') && !q('.init-steps') && q('#subAdd').getBoundingClientRect().top < q('#subWiz').getBoundingClientRect().top);
ok('공고 없이도 질문 시작', !q('#subWiz').hidden && q('#wizCount').textContent.startsWith('1 / 7'));
ok('유형 고르기에 준비 중 칸', q('.wiz-pick button.soon')?.disabled === true);
ok('1단계에서는 다음 버튼 숨김', q('#wizNext').hidden);
q('[data-wtier="newlywed"]').click(); await W(80);
ok('유형 카드 누르면 바로 2단계', q('#wizCount').textContent.startsWith('2 / 7') && !q('#wizNext').hidden, q('#wizCount').textContent);
for (let i = 0; i < 6; i++) { q('#wizNext').click(); await W(80); }
ok('질문 끝 → 요약 바 + 공고 안내', !q('#meBar').hidden && q('#subWiz').hidden && q('#subJudge').textContent.includes('공고를 고르면'), q('#meBar').textContent);
q('#subJudge [data-sample]').click(); await W(900);
ok('예시 공고 → 내 조건으로 판정(체험 아님)', !!q('#subJudge .sig') && !q('#subJudge').classList.contains('is-demo'), q('#subJudge .sig')?.textContent);
ok('내 공고 목록', qa('#subList .sub-pick').length === 1 && q('#subList .sig-mini'), qa('#subList .sub-pick').length);
ok('유형 탭 옆 준비 중 배지', q('#subJudge .sub-tabs .soon-tag')?.textContent.includes('준비 중'));
const acc = qa('#subJudge .sub-main details.easy-more');
ok('아코디언 3개 · 기본 닫힘', acc.length === 3 && acc.every(x => !x.open), acc.map(x => x.querySelector('summary').textContent).join(' / '));
ok('SUITABLE HOME 비교 링크', !!q('#subJudge a[href="https://dionelee.github.io/suitable-home/#listings"]'));
ok('매물 연결 버튼 없음', !d.body.textContent.includes('매물로 비교에 넣기') && !q('[data-tadd]'));
ok('누구나 쓰는 말 (우리 부부·예시 가족·우리 상황 없음)', !/우리 부부|예시 가족|우리 상황|우리에게|우리 세대/.test(d.body.innerText + q('#subWiz').textContent));
const mc = q('[data-set="myCash"]'); mc.value = '3000'; mc.dispatchEvent(new fw.Event('input', { bubbles: true })); await W(100);
ok('돈 조건 → 요약 문구', q('#moneySum').textContent.includes('3,000만원'), q('#moneySum').textContent);
const sv = JSON.parse(fw.localStorage.getItem('cheongyak-check-v1'));
ok('이 사이트 키에 저장', sv.subs.notices.length === 1 && sv.settings.myCash === 3000 && sv.subs.wizard.done);
ok('기존 사이트 키는 만들지 않음', fw.localStorage.getItem('newlywed-home-v1') === null);
const fi = (id, to) => ({ id, org: 'LH', title: '피드 ' + id, region: '서울', kind: '행복주택', posted: '2026-11-01', from: '', to, url: 'https://apply.lh.or.kr' });
fw.eval('setFeed')({ updated: '2026-11-06T09:00:00+09:00', source: '마이홈포털·LH 공식 API', items: [1,2,3,4,5,6,7,8,9,10].map(i => fi('f' + i, '2099-01-' + String(i).padStart(2, '0'))) }); await W(50);
fw.eval('setFeed')({ updated: '', source: '', items: [fi('s1', '2099-01-01'), { ...fi('g1', '2099-01-01'), region: '경기 성남시' }] }); await W(50);
ok('피드는 서울 공고만', qa('#subFeed li').length === 1 && !q('#subFeed').textContent.includes('경기'));
fw.eval('setFeed')({ updated: '2026-11-06T09:00:00+09:00', source: '마이홈포털·LH 공식 API', items: [1,2,3,4,5,6,7,8,9,10].map(i => fi('f' + i, '2099-01-' + String(i).padStart(2, '0'))) }); await W(50);
ok('피드 8개 + 더 보기 · 줄 전체가 링크', qa('#subFeed li').length === 8 && qa('#subFeed li a.nm[target="_blank"]').length === 8 && /2개 더 보기/.test(q('#subFeed [data-feedmore]')?.textContent || ''), qa('#subFeed li').length);
const rf = fw.fetch; fw.fetch = async (u, o) => String(u).includes('feed/detail/lh-d1.json') ? new fw.Response(JSON.stringify({ id: 'lh-d1', read: '2026-11-07', target: '<b>청년</b>', eligibility: ['무주택'], special: ['한부모 가점'] })) : rf(u, o);
fw.eval('setFeed')({ updated: '', source: '', items: [{ ...fi('lh-d1', '2099-01-01'), detail: true }, fi('f2', '2099-01-02'), { ...fi('f3', '2099-01-03'), id: '../x', detail: true }] }); await W(50);
q('#subFeed [data-detail="lh-d1"]').click(); await W(300); fw.fetch = rf; const dt1 = q('#subFeed [data-det="lh-d1"]');
ok('상세보기 → 신청 조건 펼침 (상세 있는 공고만 · AI 안내 · 글자 그대로)', qa('#subFeed .dbtn').length === 1 && !dt1.hidden && dt1.textContent.includes('<b>청년</b>') && dt1.textContent.includes('한부모 가점') && dt1.textContent.includes('AI가 공고문에서'), dt1?.textContent.slice(0, 80));
q('#subFeed [data-detail="lh-d1"]').click(); await W(50);
ok('상세보기 다시 누르면 접힘', dt1.hidden && q('#subFeed [data-detail="lh-d1"]').getAttribute('aria-expanded') === 'false');
// AI 공고 PDF 읽기 (가짜 Worker 응답)
const yong = await (await fetch('samples/notice_yongsan.json')).json(), calls = [];
const pdf = await (await fetch('samples/notice_example.pdf')).blob(), dt = new fw.DataTransfer(); dt.items.add(new fw.File([pdf], 'notice_example.pdf', { type: 'application/pdf' }));
q('#subPdf').files = dt.files; q('#subPdf').dispatchEvent(new fw.Event('change')); for (let n = 0; n < 30 && q('#subSend').hidden; n++) await W(100);   // FileReader 끝날 때까지
ok('PDF 고르면 보낼 내용 안내 (버튼을 눌러야 보냄)', !q('#subSend').hidden && q('#subSend [data-what]').textContent.includes('notice_example.pdf'));
const real = fw.fetch; fw.fetch = async (u, o) => { calls.push([String(u), String(o?.body || '').slice(0, 5)]); await W(100); if (calls.length === 1) return new fw.Response(JSON.stringify({ error: 'gemini', why: ['m: 503 UNAVAILABLE'] }), { status: 502 }); return new fw.Response(JSON.stringify({ text: JSON.stringify({ ...(yong.notice ?? yong), id: 'ai-test', name: 'AI 테스트 공고', short: 'AI 테스트' }) })); };
q('#subSend [data-go]').click(); for (let n = 0; n < 60 && fw.eval('state.subs.notices.length') < 2; n++) await W(100); fw.fetch = real;
ok('AI 붐빔(503) → 2초 뒤 한 번 더 → 공고 추가 · PDF만 보냄', fw.eval('state.subs.notices.length') === 2 && calls.length === 2 && calls.every(c => c[0].endsWith('/notice') && c[1] === 'JVBER'), JSON.stringify(calls));
const yb = yong.notice ?? yong; fw.eval('addNotice')({ ...yb, id: 'gg', name: '경기 공고', short: '경기 공고', city: '경기', addr: '경기도 성남시 분당구 1', region: '분당구' }, '테스트'); await W(50);
ok('서울 밖 공고는 넣지 않음', fw.eval('state.subs.notices.length') === 2 && q('#subMsg').textContent.includes('서울 공고만'), q('#subMsg').textContent);
q('[data-jump="ai"]').click(); await W(100);
ok('위 칩 AI 설정 → 펼침', q('#aiSet').open);
let blob = null; const ou = fw.URL.createObjectURL; fw.URL.createObjectURL = b => { blob = b; return 'blob:x'; };
q('#exportBtn').click(); fw.URL.createObjectURL = ou; const ex = JSON.parse(await blob.text());
ok('내보내기: 청약·돈 조건만 (AI 키 없음)', ex.app === 'cheongyak-check' && ex.data.subs.notices.length === 2 && !JSON.stringify(ex).includes('suitable-gemini-key') && !('geo' in ex.data), Object.keys(ex.data));
ex.data.subs.notices = ex.data.subs.notices.slice(0, 1); const dt2 = new fw.DataTransfer(); dt2.items.add(new fw.File([JSON.stringify(ex)], 'back.json', { type: 'application/json' }));
q('#importFile').files = dt2.files; q('#importFile').dispatchEvent(new fw.Event('change')); for (let n = 0; n < 30 && !q('#ioYes'); n++) await W(100);   // 파일 읽기 끝날 때까지
ok('입력이 있으면 덮어쓰기 확인', !!q('#ioYes') && fw.eval('state.subs.notices.length') === 2);
q('#ioYes')?.click(); await W(200);
ok('확인하면 불러온 내용으로', fw.eval('state.subs.notices.length') === 1 && fw.eval('state.settings.myCash') === 3000);
"""

MOBILE = r"""
const q = s => d.querySelector(s), before = localStorage.getItem('newlywed-home-v1');
ok('390 첫 화면은 공고 바로가기부터', q('h1').getBoundingClientRect().bottom <= fw.innerHeight && q('#linksSec').getBoundingClientRect().top < q('#subsSec').getBoundingClientRect().top);
ok('390 가로 넘침 없음 (첫 화면)', d.documentElement.scrollWidth <= fw.innerWidth, d.documentElement.scrollWidth);
ok('기존 사이트 입력 발견 → 배너', !q('#importBanner').hidden);
q('#importGo').click(); await W(600);
const S = fw.eval('state.subs'), O = JSON.parse(before).subs;
ok('가져오기: 공고·내 상황 그대로', S.notices.length === O.notices.length && JSON.stringify(S.me) === JSON.stringify(O.me) && S.tab === O.tab, S.notices.length);
ok('가져오기: 돈 조건', fw.eval('state.settings.depMax') === JSON.parse(before).settings.depMax);
ok('기존 사이트 데이터는 그대로 (글자 하나 안 바뀜)', localStorage.getItem('newlywed-home-v1') === before);
ok('가져온 뒤 배너 숨김 · 결과 보임', q('#importBanner').hidden && !!q('#subJudge .sig'));
for (const x of d.querySelectorAll('details')) x.open = true; await W(100);
ok('390 가로 넘침 없음 (결과·접힌 칸 모두 펼침)', d.documentElement.scrollWidth <= fw.innerWidth, d.documentElement.scrollWidth);
ok('휴대폰: 공고 바로가기 → 내 공고 → 진단 순서', q('#linksSec').getBoundingClientRect().top < q('#subListBox').getBoundingClientRect().top && q('#subListBox').getBoundingClientRect().top < q('#subJudge').getBoundingClientRect().top);
await open('');
ok('다시 열어도 유지 · 배너 안 뜸', fw.eval('state.subs.notices.length') === O.notices.length && d.querySelector('#importBanner').hidden);
localStorage.removeItem('cheongyak-check-v1'); await open('');
const dt = new fw.DataTransfer(); dt.items.add(new fw.File([JSON.stringify({ app: 'suitable-home', version: 3, exportedAt: '2026-11-06T00:00:00Z', data: JSON.parse(before) })], 'suitable-home-2026-11-06.json', { type: 'application/json' }));
d.querySelector('#importFile').files = dt.files; d.querySelector('#importFile').dispatchEvent(new fw.Event('change')); for (let n = 0; n < 30 && !fw.eval('state.subs.notices.length'); n++) await W(100);
ok('SUITABLE HOME 내보내기 파일 불러오기 (다른 도메인용)', fw.eval('state.subs.notices.length') === O.notices.length && JSON.stringify(fw.eval('state.subs.me')) === JSON.stringify(O.me));
ok('파일 불러와도 기존 사이트 데이터 그대로', localStorage.getItem('newlywed-home-v1') === before);
"""

# 시나리오: 두 사이트에 똑같이 넣는 코드 (state.subs.me · state.settings 는 두 사이트 모양이 같다)
SCEN = {
    "seed": "",
    "소득 120% 초과": "state.subs.me.a.income = 404;",
    "120% 경계": "state.subs.me.a.income = 403.95;",
    "청년 자산 초과": "state.subs.me.nw.married = ''; state.subs.me.yt.single = true; state.subs.me.yt.homeless = true; state.subs.me.yt.asset = 25101;",
    "자동차 초과": "state.subs.me.hasCar = true; state.subs.me.car = 4543;",
    "돈 조건 바꿈": "state.settings.myCash = 1000; state.settings.budget = null; state.settings.depMax = 13000; state.settings.rate = 4.5;",
    "빈칸 있음": "state.subs.me.b.income = null; state.subs.me.nw.homeless = null;",
}
COLLECT = r"""
fw.__today = '2026-11-06';
const col = () => { const m = d.querySelector('#subJudge .sub-main'); if (!m) return null; const T = s => [...m.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  const why = [...m.querySelectorAll('.why li')].map(li => { const c = li.cloneNode(true); c.querySelectorAll('button').forEach(b => b.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
  return { sig: T('.sig'), why, fit: T('.fit-home dd'), over: T('.fit-home .over'), judge: T('.sub-judge li'), badges: T('.sub-judge .badge'), opts: T('table.rank tbody tr'), next: T('.next-do .dd') }; };
const SC = %s, res = {};
const base = JSON.stringify(fw.eval('({ me: state.subs.me, settings: state.settings })'));
for (const [name, code] of Object.entries(SC)) {
  fw.eval(`(() => { const b = ${base}; Object.assign(state.subs.me, structuredClone(b.me)); Object.assign(state.settings, b.settings); state.subs.wizard.done = true; ${code} })()`);
  for (const id of fw.eval('state.subs.notices.map(n => n.id)')) for (const tab of ['newlywed', 'youth']) {
    fw.eval(`state.subs.sel = ${JSON.stringify(id)}; state.subs.tab = '${tab}'; render()`); await W(120); res[`${name} · ${id} · ${tab}`] = col(); }
}
d.querySelector('#subJudge') && 0; out.push(['DATA', 'judge', JSON.stringify(res)]);
"""
DEMO = r"""
fw.__today = '2026-11-06'; d.querySelector('#subSample').click(); await W(1200);
const col = () => { const m = d.querySelector('#subJudge .sub-main'); if (!m) return null; const T = s => [...m.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  return { sig: T('.sig'), fit: T('.fit-home dd'), judge: T('.sub-judge li'), opts: T('table.rank tbody tr') }; };
const res = {}; for (const tab of ['newlywed', 'youth']) { fw.eval(`state.subs.tab = '${tab}'; render()`); await W(150); res['예시 체험 · ' + tab] = col(); }
out.push(['DATA', 'demo', JSON.stringify(res)]);
"""

SW = r"""
const hits = async () => (await (await fetch('/__hits?' + Math.random(), { cache: 'no-store' })).json());   // 물음표: 서비스 워커 저장본을 피함
await fw.navigator.serviceWorker.ready; await W(500); await open(''); await W(500);
ok('서비스 워커가 화면을 맡음', !!fw.navigator.serviceWorker.controller);
const ks = await caches.keys(); ok('저장소 이름에 버전', ks.length === 1 && /^cheongyak-check-/.test(ks[0]), ks.join(','));
const h1 = await hits(); await open(''); await W(300); const h2 = await hits();
ok('index.html 은 늘 인터넷 먼저', (h2['/index.html'] || 0) > (h1['/index.html'] || 0), JSON.stringify([h1['/index.html'], h2['/index.html']]));
ok('피드는 늘 인터넷 먼저', (h2['/feed/notices.json'] || 0) > (h1['/feed/notices.json'] || 0), JSON.stringify([h1, h2]));
ok('아이콘은 저장본 (다시 받지 않음)', (h2['/icons/icon-192.png'] || 0) === (h1['/icons/icon-192.png'] || 0), JSON.stringify([h1['/icons/icon-192.png'], h2['/icons/icon-192.png']]));
await fetch('/__offline/on?' + Date.now(), { cache: 'no-store' }); await open(''); await W(300);
ok('서버가 꺼져도(503) 저장본으로 열림', !!d.querySelector('#subsSec') && typeof fw.eval('render') === 'function');
d.querySelector('#subSample').click(); await W(500);
ok('오프라인에서도 예시 공고(저장본)', fw.eval('state.subs.notices.length') === 1);
await fetch('/__offline/off?' + Date.now(), { cache: 'no-store' });
"""

def main():
    procs = [serve(NEW_PORT, REPO)]
    have_old = (OLD_REPO / "index.html").exists()
    if have_old: procs.append(serve(OLD_PORT, OLD_REPO))
    logs_all = []
    try:
        for label, body, kw in [("PC 1280", PC, {}), ("휴대폰 390", MOBILE, {"w": 390, "h": 844, "seeds": {"newlywed-home-v1": old_seed}}), ("서비스 워커", SW, {"budget": None})]:
            res, logs = run(body, REPO, NEW_PORT, "/index.html", **kw); logs_all += logs
            for st, n, g in res: rows.append((st, f"[{label}] {n}", g))
        if have_old:
            sc = COLLECT % json.dumps(SCEN, ensure_ascii=False)
            a, la = run(sc, OLD_REPO, OLD_PORT, "/index.html", seeds={"suitable-intro": "1", "newlywed-home-v1": old_seed}, hash_="#subs", budget=120000)
            b, lb = run(sc, REPO, NEW_PORT, "/index.html", seeds={NEW_KEY: mine}, budget=120000)
            da, db = run(DEMO, OLD_REPO, OLD_PORT, "/index.html", seeds={"suitable-intro": "1"}, hash_="#subs"), run(DEMO, REPO, NEW_PORT, "/index.html")
            logs_all += la + lb + da[1] + db[1]
            data = lambda res: json.loads(next((g for s, n, g in res if s == "DATA"), "{}"))
            ja, jb = {**data(a), **data(da[0])}, {**data(b), **data(db[0])}
            ok("[판정 동등성] 결과를 모음", len(ja) == len(jb) == 2 + len(SCEN) * 2, f"old {len(ja)} · new {len(jb)}")
            for k in ja:
                ok(f"[판정 동등성] {k}", ja[k] is not None and ja[k] == jb.get(k), "" if ja[k] == jb.get(k) else json.dumps({"old": ja[k], "new": jb.get(k)}, ensure_ascii=False)[:600])
            for r in a + b + da[0] + db[0]:
                if r[0] == "NG": rows.append(("NG", "[판정 동등성 실행] " + r[1], r[2]))
        else:
            ok("판정 동등성 (../sjcu 없음 → 건너뜀)", True)
    finally:
        for p in procs: p.terminate()
    ok("콘솔 자체검사 실패·오류 0건", not logs_all, " | ".join(l[-200:] for l in logs_all[:5]))
    for st, n, g in rows: print(st, n, ("→ " + g) if g and st == "NG" else "")
    bad = [r for r in rows if r[0] == "NG"]
    print(f"\n{len(rows) - len(bad)}/{len(rows)} OK")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
