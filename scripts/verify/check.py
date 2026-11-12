"""청약 체크 자동 검사 — 임시 Chrome 프로필 + localhost 테스트 서버 (실제 저장 데이터와 섞이지 않음)

사용: python scripts/verify/check.py            (서버는 이 스크립트가 띄우고 끝나면 끈다)
  1) 정적 검사: 기존 저장 키에 쓰기 없음 · API 키 없음 · 방문자 분석 도구 없음 · sw.js VERSION
  2) 기능 (PC 1280): 첫 화면 · 2단 · 질문 · 예시 공고 · 아코디언 · 문구 · 저장 · 피드 5개 · AI PDF 읽기 · 내보내기/불러오기
  3) 휴대폰 390: 첫 화면 · 가로 넘침 · 같은 저장 공간 가져오기(원본 그대로) · SUITABLE HOME 파일 불러오기
  4) 판정 동등성: 같은 내 상황을 SUITABLE HOME 마지막 청약 버전(../sjcu/index_v28_backup.html)과 이 사이트에 넣고 결과 글자 비교 (시나리오 7 × 신혼부부·청년)
     SUITABLE HOME 은 2026-11-09 청약 화면을 뺐다 → 그 직전 백업을 기준으로 판정이 바뀌지 않았는지 본다
  5) 서비스 워커: index.html·피드는 인터넷 먼저 · 아이콘은 저장본 · 서버가 꺼져도 저장본으로 열림
"""
import os, hashlib, json, re, socket, subprocess, sys, tempfile, time, urllib.parse
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
REPO = Path(__file__).resolve().parents[2]
OLD_REPO = REPO.parent / "sjcu"; OLD_PAGE = "/index_v28_backup.html"   # SUITABLE HOME 청약이 있던 마지막 버전
CHROME = os.environ.get("CHROME") or (r"C:\Program Files\Google\Chrome\Application\chrome.exe" if os.name == "nt" else "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
NEW_PORT = int(os.environ.get("CHECK_PORT", 8766)); OLD_PORT = NEW_PORT + 1   # 포트가 겹치면 CHECK_PORT=8790 처럼 바꿔 실행
SEED = json.loads((REPO / "scripts/verify/seed_subs.json").read_text(encoding="utf-8"))   # 가짜 값 (SUITABLE HOME seed_v10 과 같은 사람)
rows = []
def ok(name, cond, got=""): rows.append(("OK" if cond else "NG", name, str(got)))

# ---------- 1) 정적 검사 ----------
src = (REPO / "index.html").read_text(encoding="utf-8")
_site = re.search(r"const NEW_SITE = '([^']+)'", src).group(1)
ok("새 주소는 상수 NEW_SITE 한 곳 · 공유 미리보기(og:) 두 줄도 같은 값 · 남의 주소(seoul- 없는 이름) 없음", _site == "https://seoul-cheongyak-check.pages.dev/" and f'og:url" content="{_site}"' in src and f'og:image" content="{_site}icons/' in src and not re.search(r"(?<![\w-])cheongyak-check\.pages\.dev", src), _site)
ok("기존 저장 키(newlywed-home-v1)는 읽기만", src.count("newlywed-home-v1") == 1 and not re.search(r"(setItem|removeItem)\(\s*OLD_KEY", src) and src.count("OLD_KEY") == 2, src.count("OLD_KEY"))
tracked = [p for p in REPO.rglob("*") if p.is_file() and ".git" not in p.parts and p.suffix in {".html", ".js", ".mjs", ".json", ".yml", ".md", ".py", ".webmanifest"}]
_csp = subprocess.run([sys.executable, str(REPO / "scripts" / "csp.py")], capture_output=True, text=True, encoding="utf-8")
ok("CSP: _headers 의 인라인 스크립트 해시가 지금 index.html 과 같음 (다르면 python scripts/csp.py --write)", _csp.returncode == 0, _csp.stdout.strip())
ok("API 키(AIza…) 없음", not any("AIza" in p.read_text(encoding="utf-8", errors="ignore") for p in tracked if p.name != "check.py"))
_swv = re.search(r"VERSION = 'cheongyak-check-([\w-]+)'", (REPO / "sw.js").read_text(encoding="utf-8")).group(1)
ok("lib/feed-tools.js?v= 가 sw.js VERSION 과 같음 (배포 직후 옛 lib 가 섞이지 않게)", f'lib/feed-tools.js?v={_swv}"' in src, _swv)
ok("방문자 분석·광고 도구 없음", not re.search(r"googletagmanager|gtag\(|google-analytics|clarity\.ms|hotjar|mixpanel|amplitude|plausible", src))
try:
    changed = subprocess.run(["git", "-C", str(REPO), "diff", "--name-only", "HEAD"], capture_output=True, text=True).stdout.split()
    ok("index.html·아이콘·예시를 바꿨으면 sw.js VERSION 도 바꿈", not any(c.startswith(("index.html", "icons/", "samples/", "manifest", "lib/")) for c in changed) or "sw.js" in changed, changed)
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
})().catch(e => { document.body.innerHTML = '<pre id="r">' + encodeURIComponent(JSON.stringify([...out, ['NG', 'script error', e.message + ' ' + e.stack]])) + '</pre>'; }).finally(() => fetch('/__done?' + Date.now()).catch(() => {}));"""

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
TERMS = {"cheongyak-check-terms": "2026-11-09"}   # 이용약관 확인함 (확인 카드 검사는 PC 에서)
mine = json.dumps({"subs": SEED["subs"], "settings": SEED["settings"]}, ensure_ascii=False)
old_seed = json.dumps({**SEED, "listings": []}, ensure_ascii=False)   # 가짜 SUITABLE HOME 데이터 (매물 없이 청약만)

PC = r"""
const q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
ok('기존 데이터 없으면 가져오기 숨김 (진단 배너 · 공고 탭 한 줄)', q('#importBanner').hidden && q('#importHint').hidden);
ok('맨 위는 서울 진행중 공고 (원문 사이트 4곳)', q('h1').textContent.includes('진행중 공고') && qa('#linksSec .src-grid a[target="_blank"]').length === 4);
// 탭 4개 (#notices · #danji · #diag · #settings)
const vis = () => qa('[data-tab]').filter(s => !s.hidden).map(s => s.dataset.tab).join(), cur = () => qa('[aria-current="page"]').map(a => a.dataset.tabLink).join();
const foot = () => q('footer').offsetHeight > 0 && q('footer').textContent.includes('참고용');
ok('탭: 처음 주소 → #notices · 공고 탭만 보임 · 메뉴 "공고/단지/진단" 3개 (설정은 메뉴에 없음) · 지금 탭 표시', fw.location.hash === '#notices' && vis() === 'notices' && cur() === 'notices' && qa('[data-tab-link]').map(a => a.textContent).join('/') === '공고/단지/진단' && !q('header a[href="#settings"]') && foot(), vis() + ' ' + cur());
fw.scrollTo(0, 400); q('[data-tab-link="diag"]').click(); await W(150);
ok('탭: 진단 링크 → 진단 탭만 · 맨 위로 · 제목에 포커스 · 맨 아래 안내 그대로', vis() === 'diag' && cur() === 'diag' && fw.scrollY === 0 && d.activeElement === q('#h-diag') && foot(), vis() + ' ' + fw.scrollY + ' ' + d.activeElement?.id);
{ const fl = q('footer a[href="#settings"]');
  ok('맨 아래 안내 줄에 작은 링크 "데이터 백업·옮기기" 하나 (설정으로 가는 길)', fl?.textContent === '데이터 백업·옮기기' && qa('a[href="#settings"]').length === 1);
  fl.click(); await W(150); }
ok('설정(#settings): 제목 "데이터 백업·옮기기" · 맨 위 내보내기/불러오기(늘 펼침) · 그 아래 접힌 "고급"(AI 설정 · 공고 JSON 직접 고치기) · 메뉴에 지금 탭 표시 없음 · 제목 포커스',
  vis() === 'settings' && fw.location.hash === '#settings' && q('#h-set').textContent === '데이터 백업·옮기기' && q('#ioSet').tagName !== 'DETAILS' && !!q('#ioSet #exportBtn') && !!q('#ioSet #importFile')
  && q('#ioSet').compareDocumentPosition(q('#advSet')) & 4 && q('#advSet').tagName === 'DETAILS' && !q('#advSet').open && q('#advSet').contains(q('#aiSet')) && q('#advSet').contains(q('#subAdv'))
  && q('#advSet summary').offsetParent !== null && cur() === '' && d.activeElement === q('#h-set') && foot(), cur());
fw.history.back(); await W(200);
ok('탭: 뒤로가기 → 진단', vis() === 'diag' && fw.location.hash === '#diag', fw.location.hash);
fw.history.back(); await W(200);
ok('탭: 뒤로가기 한 번 더 → 공고', vis() === 'notices' && fw.location.hash === '#notices', fw.location.hash);
fw.location.hash = 'abc'; await W(150);
ok('탭: 이상한 주소 #abc → #notices', fw.location.hash === '#notices' && vis() === 'notices', fw.location.hash);
fw.location.hash = 'subsSec'; await W(150);
ok('탭: 예전 주소 #subsSec → #notices', fw.location.hash === '#notices' && vis() === 'notices', fw.location.hash);
fw.location.hash = 'diag'; await W(150);
ok('PC 한 줄 기둥 (880px)', getComputedStyle(q('#subsSec')).maxWidth === '880px' && getComputedStyle(q('#linksSec')).maxWidth === '880px');
ok('자체검사 함수가 실행됨(판정 코드 옮김)', typeof fw.eval('elig') === 'function' && typeof fw.eval('pickOption') === 'function');
ok('진단 제목 바로 밑에 PDF 올리기 + 질문 (안내 카드 없음)', q('#h-diag').textContent.includes('순위·점수') && !q('#subAdd').hidden && !!q('#subAdd #subPdf') && !q('.init-steps') && q('#subAdd').getBoundingClientRect().top < q('#subWiz').getBoundingClientRect().top);
ok('공고 없이도 질문 시작', !q('#subWiz').hidden && q('#wizCount').textContent.startsWith('1 / 7'));
ok('유형 고르기에 준비 중 칸', q('.wiz-pick button.soon')?.disabled === true);
ok('1단계에서는 다음 버튼 숨김', q('#wizNext').hidden);
q('[data-wtier="newlywed"]').click(); await W(80);
ok('유형 카드 누르면 바로 2단계', q('#wizCount').textContent.startsWith('2 / 7') && !q('#wizNext').hidden, q('#wizCount').textContent);
fw.location.hash = 'notices'; await W(120); fw.location.hash = 'diag'; await W(120);
ok('탭을 바꿔도 질문 진행(2단계) 유지', q('#wizCount').textContent.startsWith('2 / 7') && !q('#subWiz').hidden, q('#wizCount').textContent);
for (let i = 0; i < 6; i++) { q('#wizNext').click(); await W(80); }
ok('질문 끝 → 요약 바 + 공고 안내', !q('#meBar').hidden && q('#subWiz').hidden && q('#subJudge').textContent.includes('공고를 고르면'), q('#meBar').textContent);
ok('질문을 "다음"으로 지나가면 그 단계 기본값(자동차 없음·세대 구분)을 확인한 것으로 기록', fw.eval('state.subs.seen.hasCar === true && state.subs.seen["yt.house"] === true'));
q('#subJudge [data-sample]').click(); await W(900);
ok('약관: 내 조건 결과를 처음 볼 때 확인 카드 먼저 (결과·목록 신호등 숨김)', !!q('#subJudge .terms-card a[href="terms.html"]') && !q('#subJudge .sub-main .sig') && !q('#subList .sig-mini') && fw.localStorage.getItem('cheongyak-check-terms') === null);
q('#subJudge [data-terms-ok]').click(); await W(150);
ok('약관: "확인했어요" → 결과 · 이 기기에 기억 (판정 데이터와 다른 키)', !q('.terms-card') && !!q('#subJudge .sub-main .sig') && fw.localStorage.getItem('cheongyak-check-terms') === '2026-11-09' && !('terms' in JSON.parse(fw.localStorage.getItem('cheongyak-check-v1'))));
{ const m = q('#subJudge .sub-main'), sg = m.querySelector('.sig').textContent, bs = m.querySelector('.basis');
  ok('문구: 신호등은 "입력한 조건으로는 …" (단정 안 함)', /^입력한 조건(으로는 신청 가능해 보여요|만으로는 아직 판단하기 어려워요|으로는 어려워 보여요)/.test(sg), sg);
  ok('문구: 신호등 바로 아래 "예비 판정 · {공고명} 공고문 p.{쪽} 기준 · 최종 자격은 사업 주체 심사로 정해져요" + 원문 링크', m.querySelector('.sig').nextElementSibling === bs && /^예비 판정 · .+ 공고문 p\.10 기준 · 최종 자격은 사업 주체 심사로 정해져요 · 공고문 원문 ↗$/.test(bs.textContent) && bs.querySelector('a[target="_blank"]')?.href === 'https://soco.seoul.go.kr/youth/main/main.do', bs.textContent);
  ok('문구: 손으로 넣은 공고는 AI 안내 없음', !m.querySelector('.basis.ai')); }
fw.eval(`state.subs.me.hasCar = true; state.subs.me.car = 99999; render()`); await W(80);
{ const m = q('#subJudge .sub-main'), co = m.querySelector('.callout');
  ok('문구: 어려워 보여요 → "포기하지 말고" 콜센터 안내 (LH·SH 번호 · 청년안심주택은 공고문 문의처) + 원문 링크', m.querySelector('.sig').textContent === '입력한 조건으로는 어려워 보여요' && /포기하지 말고 공고문이나 콜센터\(LH 1600-1004, SH 1600-3456 등 · 청년안심주택은 공고문의 문의처\)에서 확인하세요/.test(co?.textContent) && !!co.querySelector('a[target="_blank"]'), co?.textContent);
  ok('문구: 이유·배지도 같은 톤 ("어려워 보여요" · "어려워 보임")', [...m.querySelectorAll('.why li')].some(li => li.textContent.includes('어려워 보여요.')) && [...m.querySelectorAll('.sub-judge .badge')].some(b => b.textContent === '어려워 보임')); }
fw.eval(`state.subs.me.hasCar = false; state.subs.me.car = null; render()`); await W(80);
ok('문구: 가능·확인 필요일 때는 콜센터 안내 없음', q('#subJudge .sub-main .sig').textContent !== '입력한 조건으로는 어려워 보여요' && !q('#subJudge .callout'));
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
fw.location.hash = 'settings'; await W(120); fw.location.hash = 'diag'; await W(120);
ok('탭을 바꿔도 입력값 유지', q('[data-set="myCash"]').value === '3000' && q('#moneySum').textContent.includes('3,000만원'));
const sv = JSON.parse(fw.localStorage.getItem('cheongyak-check-v1'));
ok('이 사이트 키에 저장', sv.subs.notices.length === 1 && sv.settings.myCash === 3000 && sv.subs.wizard.done);
ok('기존 사이트 키는 만들지 않음', fw.localStorage.getItem('newlywed-home-v1') === null);
const fi = (id, to) => ({ id, org: 'LH', title: '피드 ' + id, region: '서울', kind: '행복주택', posted: '2026-11-01', from: '', to, url: 'https://apply.lh.or.kr' });
fw.eval('setFeed')({ updated: '2026-11-06T09:00:00+09:00', source: '마이홈포털·LH 공식 API', items: [1,2,3,4,5,6,7,8,9,10].map(i => fi('f' + i, '2099-01-' + String(i).padStart(2, '0'))) }); await W(50);
fw.eval('setFeed')({ updated: '', source: '', items: [fi('s1', '2099-01-01'), { ...fi('g1', '2099-01-01'), region: '경기 성남시' }] }); await W(50);
ok('피드는 서울 공고만', qa('#subFeed .flist > li').length === 1 && !q('#subFeed').textContent.includes('경기'));
fw.eval('setFeed')({ updated: '2026-11-06T09:00:00+09:00', source: '마이홈포털·LH 공식 API', items: [1,2,3,4,5,6,7,8,9,10].map(i => fi('f' + i, '2099-01-' + String(i).padStart(2, '0'))) }); await W(50);
ok('피드 8개 + 더 보기 · 줄 전체가 링크', qa('#subFeed .flist > li').length === 8 && qa('#subFeed .flist > li a.nm[target="_blank"]').length === 8 && /2개 더 보기/.test(q('#subFeed [data-feedmore]')?.textContent || ''), qa('#subFeed .flist > li').length);
const rf = fw.fetch; fw.fetch = async (u, o) => String(u).includes('feed/detail/lh-d1.json') ? new fw.Response(JSON.stringify({ id: 'lh-d1', read: '2026-11-07', target: '<b>청년</b>', eligibility: ['무주택'], special: ['한부모 가점'], supply: [{ type: '25A 1510호', area: '20.17㎡', units: '1', price: '보증금 9,300만원' }] })) : rf(u, o);
fw.eval('setFeed')({ updated: '', source: '', items: [{ ...fi('lh-d1', '2099-01-01'), detail: true }, fi('f2', '2099-01-02'), { ...fi('f3', '2099-01-03'), id: '../x', detail: true }] }); await W(50);
q('#subFeed [data-detail="lh-d1"]').click(); await W(300); fw.fetch = rf; const dt1 = q('#subFeed [data-det="lh-d1"]');
ok('상세보기 → 신청 조건 펼침 (상세 있는 공고만 · AI 안내 · 글자 그대로)', qa('#subFeed button.dbtn[data-detail]').length === 1 && !dt1.hidden && dt1.textContent.includes('<b>청년</b>') && dt1.textContent.includes('한부모 가점') && dt1.textContent.includes('AI가 공고문에서') && dt1.textContent.includes('20.17㎡ · 1세대 · 보증금'), dt1?.textContent.slice(0, 80));
q('#subFeed [data-detail="lh-d1"]').click(); await W(50);
ok('상세보기 다시 누르면 접힘', dt1.hidden && q('#subFeed [data-detail="lh-d1"]').getAttribute('aria-expanded') === 'false');
ok('상세 없는 공고는 [공고 원문 보기] 링크', qa('#subFeed a.dlink[target="_blank"]').length === 2 && qa('#subFeed a.dlink').every(a => a.textContent.includes('공고 원문 보기')));
fw.__today = '2026-11-07'; fw.eval('setFeed')({ updated: '', source: '', items: [{ ...fi('youth-d2', '2026-11-10'), org: '청년안심', from: '2026-11-07', time: '23:00' }, { ...fi('youth-d3', '2026-11-12'), org: '청년안심', startOnly: true }] }); await W(50);
const r2 = qa('#subFeed .flist > li').map(li => li.textContent.replace(/\s+/g, ' '));
ok('청년안심주택: D-day 는 마감일 기준 (11.7 → 11.10 23:00 마감 D-3)', r2.length === 1 && r2[0].includes('D-3') && r2[0].includes('11.10(화) 23:00 마감'), r2.join(' / '));
q('#subFeed [data-ftab="plan"]').click(); await W(50); const r3 = qa('#subFeed .flist > li').map(li => li.textContent.replace(/\s+/g, ' '));
ok('예정 탭: 시작 전 공고 · "시작 D-5" · 마감일 모르면 시작일 표시', r3.length === 1 && r3[0].includes('시작 D-5') && r3[0].includes('청약신청일 11.12(목) · 마감일은 공고 원문에서'), r3.join(' / '));
q('#subFeed [data-ftab="now"]').click(); await W(50);
fw.eval('setFeed')({ updated: '', source: '', items: [{ ...fi('sh-f1', '2099-01-01'), org: 'SH', title: '[정정] 고덕강일 3단지 입주자모집공고' }] }); await W(50);
ok('정정공고는 배지', q('#subFeed .dd.fix')?.textContent === '정정공고' && q('#subFeed .nm').textContent.startsWith('고덕강일 3단지'));
// 캘린더 · 신청 가능 배지 · 필터 (공개 정보 ev·cr·ty·st 는 Actions 가 notices.json 에 넣음 · 판정·필터·.ics 는 브라우저에서)
ok('개인정보 문구: 캘린더 파일은 브라우저에서', d.querySelector('footer').textContent.includes('캘린더 파일은 브라우저에서 만들어져요'));
const PODIUM = { ...fi('youth-6720', '2026-11-10'), org: '청년안심', title: '[민간임대] 건대입구역 더포디엄830 추가모집공고', from: '2026-11-09', time: '23:00', detail: true, dv: 'abcdef1234',
  ev: [{ k: 'start', l: '청약 시작', d: '2026-11-09' }, { k: 'end', l: '청약 마감', d: '2026-11-10', t: '23:00' }, { k: 'announce', l: '서류심사 대상자 발표', d: '2026-11-11', t: '17:00' }],
  cr: { c: [{ k: 'age', min: 19, max: 39 }, { k: 'homeless', scope: '세대' }, { k: 'car', max: 4542 }], x: 1 },
  ty: [{ n: '25A 1510호', a: 20.17, dep: 9300, rent: 64.72 }, { n: '25B 529호', a: 20.4, dep: 9300, rent: 64.92 }, { n: '52A 2007호', a: 42.17, dep: 17300, rent: 121.45 }], st: { n: '건대입구역', m: 150, w: 3 } };
const LHX = { ...fi('lh-77', '2026-11-20'), title: 'LH 서울 행복주택 모집공고' };
fw.__today = '2026-11-09';
fw.eval(`state.subs.tab = 'youth'; Object.assign(state.subs.me, { a: { ...state.subs.me.a, birth: '1997-03-01', income: 300 }, hasCar: false, car: null }); state.subs.me.yt.homeless = true; state.subs.seen = { hasCar: true }; state.subs.wizard.done = true; render()`);
fw.eval('setFeed')({ updated: '', source: '', items: [PODIUM, LHX] }); await W(80);
ok('신청 가능 배지: 입력·확인한 값으로 기본 조건 맞아 보임 · 누르면 항목별 이유', q('#subFeed [data-why="youth-6720"]')?.textContent === '기본 조건 맞아 보임' && q('#subFeed [data-whyp="youth-6720"]').hidden, q('#subFeed [data-why="youth-6720"]')?.textContent);
q('#subFeed [data-why="youth-6720"]').click(); await W(50);
const why = q('#subFeed [data-whyp="youth-6720"]');
ok('이유: 나이 만 19~39세 ✔ · 자동차 ✔ · 기타 조건은 원문에서', !why.hidden && /✔ 나이 만 19~39세: 만 29세/.test(why.textContent) && /✔ 자동차가액 4,542만원 이하: 자동차 없음/.test(why.textContent) && /기타 조건 1개/.test(why.textContent), why.textContent.slice(0, 160));
ok('자격 기준 없는 공고는 확인 필요', q('#subFeed [data-why="lh-77"]')?.textContent === '확인 필요');
fw.eval(`state.subs.me.a.birth = '1980-01-01'; render()`); await W(50);
ok('나이 초과로 바꾸면 어려워 보임', q('#subFeed [data-why="youth-6720"]')?.textContent === '어려워 보임');
fw.eval(`state.subs.me.a.birth = '1997-03-01'; state.subs.seen = {}; render()`); await W(50);
ok('자동차 없음(기본값)을 확인하지 않았으면 확인 필요', q('#subFeed [data-why="youth-6720"]')?.textContent === '확인 필요');
fw.eval(`state.subs.seen = { hasCar: true }; render()`); await W(50);
ok('구독 링크 옆 구글 캘린더 안내', q('#subFeed .fcalnote')?.textContent.includes('구글 캘린더는 구독 갱신이 하루까지 늦고 알림을 적용하지 않아요'));
fw.eval(`state.subs.me.a.birth = '1997-03-01'; state.subs.wizard.done = false; render()`); await W(50);
ok('진단 전이면 배지 대신 안내 한 줄', !q('#subFeed .jb') && q('#subFeed .fhint')?.textContent.includes('내 조건 넣고 가능 여부 보기'));
fw.eval(`state.subs.wizard.done = true; render()`); await W(50);
ok('캘린더: 일정 있는 공고는 버튼 · 없는 공고는 "일정은 공고 원문에서" · 구독 링크 webcal://', !!q('#subFeed [data-ics="youth-6720"]') && q('#subFeed [data-fid="lh-77"] .nocal')?.textContent === '일정은 공고 원문에서' && /^webcal:\/\/.+\/feed\/calendar\.ics$/.test(q('#subFeed .facts a').getAttribute('href')));
{ let blob = null, name = ''; const ou = fw.URL.createObjectURL, oc = fw.HTMLAnchorElement.prototype.click; fw.URL.createObjectURL = b => { blob = b; return 'blob:x'; }; fw.HTMLAnchorElement.prototype.click = function () { name = this.download; };
  const rf2 = fw.fetch; fw.fetch = async (u, o) => String(u).includes('feed/detail/youth-6720.json') ? new fw.Response(JSON.stringify({ apply: '인터넷 신청: https://naver.me/GUTJuhOO', supply: [{ type: '25A 1510호' }, { type: '25B 529호' }, { type: '52A 2007호' }] })) : rf2(u, o);
  q('#subFeed [data-ics="youth-6720"]').click(); for (let n = 0; n < 20 && !blob; n++) await W(50);
  const txt = blob ? (await blob.text()).replace(/\r\n /g, '') : '';
  ok('캘린더에 추가 → 브라우저에서 .ics 만듦 (청약 기간 11.9~11.10 · 23:00 마감 · 알림 2개 · 고정 UID · 신청 링크)', /DTSTART;VALUE=DATE:20261109\r\nDTEND;VALUE=DATE:20261111/.test(txt) && txt.replace(/\r\n /g, '').includes('청약 기간 (11/10 23:00 마감)') && (txt.match(/BEGIN:VALARM/g) || []).length === 2 && txt.includes('UID:youth-6720-end@dionelee.github.io') && txt.includes('신청: https://naver.me/GUTJuhOO') && /\.ics$/.test(name), name + ' ' + txt.slice(0, 80));
  q('#subFeed [data-star="youth-6720"]').click(); await W(50);
  ok('★ 관심 공고: 이 브라우저에만 저장 · 관심 공고 캘린더 버튼 켜짐', JSON.parse(fw.localStorage.getItem('cheongyak-check-stars')).includes('youth-6720') && !q('#subFeed [data-starics]').disabled && q('#subFeed [data-star="youth-6720"]').textContent === '★');
  blob = null; q('#subFeed [data-starics]').click(); for (let n = 0; n < 20 && !blob; n++) await W(50);
  ok('관심 공고 전체 캘린더로 받기', !!blob && (await blob.text()).includes('X-WR-CALNAME:청약 체크 · 관심 공고') || (blob && (await blob.text()).includes('UID:youth-6720-end@')));
  fw.fetch = rf2; fw.URL.createObjectURL = ou; fw.HTMLAnchorElement.prototype.click = oc; }
// 공고 세부 탭 (진행 중 · 예정 · 완료) · 검색 (이름·역·구 + 구 선택) — 오늘 11.9
{ const P = { ...PODIUM, region: '서울 광진구' }, PL = { ...fi('youth-p1', '2026-11-25'), org: '청년안심', title: '[민간임대] 송정역 케이제이타워 최초모집공고', from: '2026-11-20', region: '서울 강서구' },
    DN = { ...fi('lh-d9', '2026-11-05'), title: 'LH 마포구 행복주택 모집공고', ev: [{ k: 'end', l: '청약 마감', d: '2026-11-05' }] }, CL = { ...fi('elyes-c9', '2026-11-30'), org: '엘리스', title: '[어바니엘 염창] 공실세대 모집공고 -->마감되었습니다.', direct: true, closed: true, region: '서울 강서구' };
  fw.eval('setFeed')({ updated: '', source: '', items: [P, LHX, PL, DN, CL] }); await W(80);
  const tabs = () => qa('#subFeed [data-ftab]').map(b => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')).join(), ids = () => qa('#subFeed .flist > li').map(l => l.dataset.fid).join();
  ok('세부 탭 3개 · 개수 · 처음은 진행 중 · 예전 필터 없음', tabs() === '진행 중2*,예정1,완료2' && ids() === 'youth-6720,lh-77' && !q('#subFeed .ffilter') && !q('#subFeed select[data-f]'), tabs() + ' / ' + ids());
  q('#subFeed [data-ftab="plan"]').click(); await W(50);
  ok('예정 탭: 모집 시작 전 공고 · 시작 D-11', ids() === 'youth-p1' && q('#subFeed [data-fid="youth-p1"]').textContent.includes('시작 D-11'), ids());
  q('#subFeed [data-ftab="done"]').click(); await W(50);
  ok("완료 탭: 마감 지난 공고 + '마감되었습니다' 공고 · '마감됨' · 캘린더 버튼 없음", ids() === 'elyes-c9,lh-d9' && qa('#subFeed .flist > li').every(l => l.textContent.includes('마감됨') && !l.querySelector('[data-ics]')), ids());
  q('#subFeed [data-ftab="now"]').click(); await W(50);
  const inp = q('#subFeed input[data-fq="q"]'); inp.value = '건대'; inp.dispatchEvent(new fw.Event('input', { bubbles: true })); await W(50);
  ok('검색 "건대" → 더포디엄830 만 · 탭 개수도 검색 결과 · 검색 칸은 다시 안 그림(한글 입력 유지)', ids() === 'youth-6720' && tabs() === '진행 중1*,예정0,완료0' && q('#subFeed input[data-fq="q"]') === inp, ids() + ' / ' + tabs());
  inp.value = ''; inp.dispatchEvent(new fw.Event('input', { bubbles: true })); await W(50);
  const gs = q('#subFeed select[data-fq="gu"]');
  ok('구 선택: 공고에 있는 구만 (지역·제목에서)', [...gs.options].map(o => o.value).join() === ',강서구,광진구,마포구', [...gs.options].map(o => o.value).join());
  gs.value = '강서구'; gs.dispatchEvent(new fw.Event('input', { bubbles: true })); await W(50);
  ok('구 "강서구" → 진행 중 0 · 예정 1 · 완료 1 · 없을 때 안내', tabs() === '진행 중0*,예정1,완료1' && q('#subFeed .fnone')?.textContent === '검색에 맞는 공고가 없어요.', tabs());
  gs.value = ''; gs.dispatchEvent(new fw.Event('input', { bubbles: true })); await W(50); }
delete fw.__today;
{ const yn = fw.eval('state.subs.notices[0]');
  fw.eval('setFeed')({ updated: '', source: '', items: [{ ...fi('m1', '2099-01-01'), title: '[정정공고] ' + yn.name, posted: '2026-11-05' }, { ...fi('x1', '2099-01-02'), title: '[SH] 아무개 행복주택 입주자모집공고', url: 'https://www.i-sh.co.kr/x?seq=1', cr: { c: [{ k: 'age', min: 19, max: 39 }, { k: 'homeless', scope: '세대' }], x: 1 } }, { ...fi('x2', '2099-01-03'), title: '[LH] 기준 없는 공고' }] }); await W(80);
  const fx = q('#subJudge .sub-main .fixnote');
  ok('정정공고: 공고일 뒤 정정 글이 있으면 결과 위에 "판정 기준일 이후 정정공고가 있어요 · 원문 확인"', !!fx && fx.textContent.startsWith('판정 기준일 이후 정정공고가 있어요 · 원문 확인') && fx.querySelector('a').href === 'https://apply.lh.or.kr/' && fx.compareDocumentPosition(q('#subJudge .sub-main .sig')) === 4, fx?.textContent);
  fw.location.hash = 'notices'; await W(120); q('#subFeed [data-diag="m1"]').click(); await W(200);
  ok('공고 목록 "진단 →" (내 공고에 있는 공고) → 그 공고가 고른 상태로 진단 탭', fw.location.hash === '#diag' && vis() === 'diag' && fw.eval('state.subs.sel') === yn.id && q('#diagFrom').hidden);
  const prevRes = q('#subJudge').innerHTML;
  ok('진단 탭에 이전 진단 결과가 보이는 상태', !q('#subJudge').hidden && !!q('#subJudge .sub-main'));
  fw.location.hash = 'notices'; await W(120); const badge = q('#subFeed [data-fid="x1"] .jb')?.textContent, whyN = qa('#subFeed [data-whyp="x1"] li').length; (q('#subFeed [data-diag="x1"]') ?? (() => { throw new Error('x1 진단 버튼 없음: ' + qa('#subFeed [data-diag]').map(b => b.dataset.diag).join() + ' / ' + q('#subFeed [data-ftab][aria-selected="true"], #subFeed [data-ftab][aria-pressed="true"]')?.textContent); })()).click(); await W(200);
  const df = q('#diagFrom'), dq = s => df.querySelector(s);
  ok('공고 목록 "진단 →" (내 공고에 없는 공고) → 진단 탭 맨 위 카드: 공고 이름 · 마감 · 원문 링크 · 이전 결과는 숨김', fw.location.hash === '#diag' && !df.hidden && dq('[data-from-name]').textContent === '아무개 행복주택' && /^2099\.01\.02 마감 · D-\d+$/.test(dq('[data-from-due]').textContent)
    && dq('[data-from-url]').href === 'https://www.i-sh.co.kr/x?seq=1' && q('#subJudge').hidden && df.compareDocumentPosition(q('#subAdd')) === 4, df.textContent);
  ok('예비 판정: 공고 목록 배지와 같은 기본 조건(cr) · 같은 판정 함수 · 조건별 ✔/✘/?', !!badge && dq('.jb')?.textContent === badge && /예비 판정/.test(dq('[data-from-judge]').textContent) && df.querySelectorAll('.fwhy li').length === whyN && whyN > 0, `${badge} / ${dq('.jb')?.textContent} · 사유 ${df.querySelectorAll('.fwhy li').length}/${whyN}`);
  ok('"순위·점수·월 부담까지 보려면 이 공고문 PDF를 올려 주세요 [PDF 올리기]"', dq('.df-next').textContent === '순위·점수·월 부담까지 보려면 이 공고문 PDF를 올려 주세요' && dq('label[for="subPdf"]')?.textContent === 'PDF 올리기', dq('.df-next').textContent);
  ok('이전 진단은 지우지 않음 (내 공고·고른 공고 그대로)', fw.eval('state.subs.notices').some(n => n.id === yn.id) && fw.eval('state.subs.sel') === yn.id && q('#subJudge').innerHTML === prevRes);
  q(`[data-nsel="${yn.id}"]`)?.click(); await W(150);
  ok('내 공고에서 다시 고르면 → 카드 닫히고 이전 진단 결과가 그대로 보임', df.hidden && !q('#subJudge').hidden && !!q('#subJudge .sub-main') && fw.eval('state.subs.sel') === yn.id, q(`[data-nsel="${yn.id}"]`) ? '' : 'data-nsel 버튼 없음');
  fw.location.hash = 'notices'; await W(120); (q('#subFeed [data-diag="x2"]') ?? (() => { throw new Error('x2 진단 버튼 없음: ' + qa('#subFeed [data-diag]').map(b => b.dataset.diag).join() + ' / ' + q('#subFeed [data-ftab][aria-selected="true"], #subFeed [data-ftab][aria-pressed="true"]')?.textContent); })()).click(); await W(200);
  ok('기본 조건 정보가 없는 공고 → "예비 판정을 못 해요" 안내 · 카드는 그 공고로 바뀜', !df.hidden && dq('[data-from-name]').textContent === '기준 없는 공고' && /기본 조건 정보가 없어 예비 판정을 못 해요/.test(dq('[data-from-judge]').textContent), dq('[data-from-judge]').textContent);
  fw.location.hash = 'notices'; await W(120); fw.location.hash = 'diag'; await W(120);
  ok('다른 탭에 갔다 오면 그 카드는 사라지고 결과가 다시 보임', q('#diagFrom').hidden && !q('#subJudge').hidden); }
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
fw.eval(`state.subs.sel = 'ai-test'; render()`); await W(80);
ok('문구: AI로 읽은 공고는 "AI가 공고문을 읽어 만든 값이에요. 소득·자산 기준은 원문과 맞춰 보세요."', fw.eval("state.subs.notices.find(n => n.id === 'ai-test').src") === 'ai' && q('#subJudge .sub-main .basis.ai')?.textContent === 'AI가 공고문을 읽어 만든 값이에요. 소득·자산 기준은 원문과 맞춰 보세요.', q('#subJudge .sub-main .basis.ai')?.textContent);
q('#subAiOff a').click(); await W(150);
ok('진단의 "AI 설정" 링크(#aiSet) → #settings · 고급과 AI 설정 펼침', fw.location.hash === '#settings' && vis() === 'settings' && q('#aiSet').open && q('#advSet').open, fw.location.hash);
let blob = null; const ou = fw.URL.createObjectURL; fw.URL.createObjectURL = b => { blob = b; return 'blob:x'; };
q('#exportBtn').click(); fw.URL.createObjectURL = ou; const ex = JSON.parse(await blob.text());
ok('내보내기: 청약·돈 조건만 (AI 키 없음)', ex.app === 'cheongyak-check' && ex.data.subs.notices.length === 2 && !JSON.stringify(ex).includes('suitable-gemini-key') && !('geo' in ex.data), Object.keys(ex.data));
ex.data.subs.notices = ex.data.subs.notices.slice(0, 1); const dt2 = new fw.DataTransfer(); dt2.items.add(new fw.File([JSON.stringify(ex)], 'back.json', { type: 'application/json' }));
q('#importFile').files = dt2.files; q('#importFile').dispatchEvent(new fw.Event('change')); for (let n = 0; n < 30 && !q('#ioYes'); n++) await W(100);   // 파일 읽기 끝날 때까지
ok('입력이 있으면 덮어쓰기 확인', !!q('#ioYes') && fw.eval('state.subs.notices.length') === 2);
q('#ioYes')?.click(); await W(200);
ok('확인하면 불러온 내용으로', fw.eval('state.subs.notices.length') === 1 && fw.eval('state.settings.myCash') === 3000);
// 주소 옮기기 (2026-11-12): 내보내기 파일에 공고 ★·단지 ★·본 공고·약관 확인까지 → 새 주소에서 불러오면 그대로
{ fw.eval(`stars.add('lh-x1'); dStars.add('x-elyes-mullae'); dSeen.add('elyes-z'); lset(SKEY, [...stars]); lset(DKEY, [...dStars]); lset(DSEEN, [...dSeen])`);
  let bl = null; const ou2 = fw.URL.createObjectURL; fw.URL.createObjectURL = b => { bl = b; return 'blob:x'; }; q('#exportBtn').click(); fw.URL.createObjectURL = ou2; const ex2 = JSON.parse(await bl.text()), D2 = ex2.data;
  ok('내보내기: 내 조건·내 공고·돈 조건·공고 ★·단지 ★·본 공고·약관 확인', !!D2.subs.me && D2.subs.notices.length === 1 && D2.settings.myCash === 3000 && D2.stars.includes('lh-x1') && D2.danjiStars.includes('x-elyes-mullae') && D2.danjiSeen.includes('elyes-z') && D2.terms === fw.eval('TERMS_V') && /관심 단지 ★ 1개/.test(q('#ioMsg').textContent), Object.keys(D2).join());
  for (const k of ['cheongyak-check-v1', 'cheongyak-check-stars', 'cheongyak-check-danji-stars', 'cheongyak-check-danji-seen', 'cheongyak-check-terms']) fw.localStorage.removeItem(k);
  await open('#settings'); const dt3 = new fw.DataTransfer(); dt3.items.add(new fw.File([JSON.stringify(ex2)], 'move.json', { type: 'application/json' }));
  d.querySelector('#importFile').files = dt3.files; d.querySelector('#importFile').dispatchEvent(new fw.Event('change')); for (let n = 0; n < 30 && fw.eval('state.subs.notices.length') !== 1; n++) await W(100);
  ok('새 주소에서 불러오기: 내 조건·공고·돈 조건 + ★·약관 확인이 이 기기에 저장', fw.eval('state.subs.notices.length') === 1 && fw.eval('state.settings.myCash') === 3000 && JSON.parse(fw.localStorage.getItem('cheongyak-check-stars')).includes('lh-x1') && JSON.parse(fw.localStorage.getItem('cheongyak-check-danji-stars')).includes('x-elyes-mullae') && JSON.parse(fw.localStorage.getItem('cheongyak-check-danji-seen')).includes('elyes-z') && fw.localStorage.getItem('cheongyak-check-terms') === fw.eval('TERMS_V')); }
{ const qq = s => d.querySelector(s);
  ok('localhost·새 주소에서는 "주소가 바뀌었어요" 띠 없음', qq('#movedBar').hidden);
  fw.eval('ON_OLD = true; renderMoved()');
  const mb = qq('#movedBar'), go = qq('#movedGo');
  ok('예전 주소(github.io): 모든 탭 위 "주소가 바뀌었어요" · 새 주소 링크 · 내 조건 옮기기 · "캘린더 구독도 새 주소로 다시 해 주세요"', !mb.hidden && !mb.closest('[data-tab]') && go.href === fw.eval('NEW_SITE') && go.href === 'https://seoul-cheongyak-check.pages.dev/' && mb.textContent.includes('캘린더 구독도 새 주소로 다시 해 주세요') && !!qq('#movedExport'));
  let bl = null; const ou3 = fw.URL.createObjectURL; fw.URL.createObjectURL = b => { bl = b; return 'blob:x'; }; qq('#movedExport').click(); fw.URL.createObjectURL = ou3;
  ok('띠의 "내 조건 옮기기" → 내보내기 파일 (★ 포함) · 안내', !!bl && JSON.parse(await bl.text()).data.stars.includes('lh-x1') && /내보냈어요/.test(qq('#movedMsg').textContent));
  fw.eval('ON_OLD = false; renderMoved()'); }
// ---------- 단지 탭 (실제 feed/danji.json) · 단지 직접 공고 · 관심 단지 새 공고 ----------
const APP = '앱을 열면 관심 단지 새 공고를 알려 드려요', OTH = '청년안심주택이 아니라 자격이 다를 수 있어요 · 공고문 확인';
fw.location.hash = 'notices'; await W(150); q('[data-tab-link="danji"]').click(); await W(300);
const cards = () => qa('#danjiList li[data-did]'), main = () => qa('#danjiList .flist')[0]?.children.length ?? 0;
ok('단지 탭: 메뉴 → #danji · 단지 탭만 · 제목 포커스 · 지금 탭 표시', fw.location.hash === '#danji' && vis() === 'danji' && cur() === 'danji' && d.activeElement === q('#h-danji'), vis() + ' ' + d.activeElement?.id);
ok('단지 탭: 청년안심주택 100곳 + "그 밖의 서울 민간임대" 6곳 (서울 밖 없음 · 단지 아닌 글 없음)', main() === 100 && !/모집공고/.test(qa('#danjiList .flist')[0].textContent) && /그 밖의 서울 민간임대 6곳/.test(q('#danjiList .fgroup')?.textContent) && qa('#danjiList .flist')[1].children.length === 6 && !/부산|양산|김포|화성/.test(q('#danjiList').textContent), main());
ok('단지 탭: 그 밖의 민간임대 카드마다 "' + OTH + '"', qa('#danjiList .flist')[1].querySelectorAll('.dj-other').length === 6 && [...qa('#danjiList .flist')[1].querySelectorAll('.dj-other')].every(p => p.textContent === OTH) && !qa('#danjiList .flist')[0].querySelector('.dj-other'));
ok('단지 탭에만 정확히 "' + APP + '" (설정에서는 뺌)', [...q('#danjiSec').querySelectorAll('p')].some(p => p.textContent.trim() === APP) && !q('[data-tab="settings"]').textContent.includes(APP));
{ const c = q('#danjiList li[data-did="20000413"]') || qa('#danjiList li[data-did]').find(l => l.textContent.includes('마에스트로')), ln = c.querySelector('.dj-links a[href^="http"]');
  ok('단지 카드: 이름 · 구 · 역 · 보증금/월세 · 홈페이지 ↗(새 창) · 전화', !!c.querySelector('.nm') && /구 · .*보증금 .*월세 /.test(c.querySelector('.finfo').textContent) && (!ln || (ln.target === '_blank' && ln.textContent === '홈페이지 ↗')) && qa('#danjiList a[href^="tel:"]').length > 50, c.textContent.slice(0, 120)); }
ok("단지 카드: '자체 사이트에서만 공고' 배지 (1년 넘음 · 추가모집 0번 단지에만)", qa('#danjiList .dd').some(b => b.textContent === '자체 사이트에서만 공고') && fw.eval(`danji.danji.filter(x => selfOnly(x, todayYmd())).every(x => x.extra === 0 && x.first)`), qa('#danjiList .dd').filter(b => b.textContent === '자체 사이트에서만 공고').length);
{ const rk = li => { const b = [...li.querySelectorAll('.dd')].map(x => x.textContent); return b.includes('청약중') ? 0 : b.includes('청약예정') ? 1 : li.querySelector('[data-dstar]').getAttribute('aria-pressed') === 'true' ? 2 : 3; };
  const main = [...qa('#danjiList .flist')[0].children], rs = main.map(rk), last = main.filter(li => rk(li) === 3);
  ok('단지 정렬: 청약중 → 청약예정 → 관심 ★ → 나머지(구 가나다) · 공급완료 배지 없음', rs.every((r, k) => !k || rs[k - 1] <= r) && rs[0] === 0 &&   /* 청약예정 단지가 있는지는 그날 피드에 따라 다름 */ !qa('#danjiList .dd').some(b => b.textContent === '공급완료') && !q('#danjiList').textContent.includes('공급완료')
    && last.every((li, k) => !k || last[k - 1].querySelector('.finfo').textContent.split(' · ').at(-0) !== null), rs.slice(0, 10).join(''));
  const pick = last.at(-1).dataset.did; q(`#danjiList [data-dstar="${pick}"]`).click(); await W(80);
  const rs2 = [...qa('#danjiList .flist')[0].children].map(rk);
  ok('단지 정렬: ★ 누른 단지는 청약예정 다음', rs2.every((r, k) => !k || rs2[k - 1] <= r) && [...qa('#danjiList .flist')[0].children][rs2.indexOf(2)].dataset.did === pick, rs2.slice(0, 10).join(''));
  q(`#danjiList [data-dstar="${pick}"]`).click(); await W(80); }
const setDf = async (k, v) => { const el = q(`#danjiBox [data-df="${k}"]`); el.value = v; el.dispatchEvent(new fw.Event('input', { bubbles: true })); await W(80); };
await setDf('gu', '강남구');
ok('단지 필터: 구', cards().length > 0 && cards().every(li => li.querySelector('.finfo').textContent.includes('강남구')), cards().length);
await setDf('gu', ''); await setDf('st', '선릉역');
ok('단지 필터: 역', cards().length >= 1 && cards().every(li => li.textContent.includes('선릉역')), cards().length);
await setDf('st', ''); const qi = q('#danjiBox [data-df="q"]'); qi.focus(); await setDf('q', '마에스트로');
ok('단지 검색: 이름 · 입력 중 포커스 유지', cards().length >= 1 && cards().length < 5 && cards().every(li => li.textContent.includes('마에스트로')) && cards()[0].textContent.includes('마에스트로') && d.activeElement === q('#danjiBox [data-df="q"]'), cards().length);
await setDf('q', '어바니엘');
ok('단지 검색: 그 밖의 민간임대도', cards().length >= 4 && cards().every(li => li.textContent.includes('어바니엘')), cards().length);
await setDf('q', '');
q('#danjiList [data-dstar="x-elyes-yeomchang"]').click(); await W(80);
ok('단지 ★: 이 기기에 저장 · 눌린 표시 · 공고 ★와 다른 키', JSON.parse(fw.localStorage.getItem('cheongyak-check-danji-stars')).includes('x-elyes-yeomchang') && q('#danjiList [data-dstar="x-elyes-yeomchang"]').getAttribute('aria-pressed') === 'true' && !(JSON.parse(fw.localStorage.getItem('cheongyak-check-stars') || '[]')).includes('x-elyes-yeomchang'));
fw.history.back(); await W(200);
ok('단지 탭: 뒤로가기 → 공고', vis() === 'notices' && fw.location.hash === '#notices', fw.location.hash);
// 단지 직접 공고가 섞인 공고 목록 (가짜 피드)
const T = fw.eval('todayYmd()'), el1 = { id: 'elyes-a1', org: '엘리스', title: '[어바니엘 염창] 공실세대 모집공고 (접수기간: 11/6~11/8)', region: '서울 강서구', kind: '민간임대', posted: T, from: T, to: T, time: '17:00', url: 'https://www.elyes.co.kr/post/recruit/detail?i_sNtCode=BHCT&nt_idx=a1', direct: true, danji: 'x-elyes-yeomchang' };
const el2 = { ...el1, id: 'elyes-a2', title: '[용산원효루미니] 추가모집공고', region: '서울 용산구', kind: '청년안심주택(민간)', to: '2099-02-01', from: T, danji: '20000406' };
const mix = items => fw.eval('setFeed')({ updated: '', source: '', items }); await mix([fi('o1', '2099-01-01'), el2, el1]); await W(120);
{ const L = qa('#subFeed .flist > li'), b1 = q('#subFeed [data-fid="elyes-a1"] .org')?.textContent, b2 = q('#subFeed [data-fid="elyes-a2"] .org')?.textContent;
  ok('공고 탭: 단지 직접 공고가 섞임 · 오늘 마감이 맨 위', L.length === 3 && L[0].dataset.fid === 'elyes-a1' && L[0].textContent.includes('오늘 마감'), L.map(l => l.dataset.fid).join());
  ok("배지: '단지 직접 · 엘리스 · 민간임대' · 101개 단지는 '단지 직접 · 엘리스'", b1 === '단지 직접 · 엘리스 · 민간임대' && b2 === '단지 직접 · 엘리스', b1 + ' / ' + b2);
  ok('단지 직접 공고 이름은 [단지 이름] 을 살림 · D-day 는 마감일 기준', q('#subFeed [data-fid="elyes-a1"] .nm').textContent.startsWith('어바니엘 염창') && /마감/.test(q('#subFeed [data-fid="elyes-a2"]').textContent), q('#subFeed [data-fid="elyes-a1"] .nm').textContent); }
{ const ev = [{ k: 'end', l: '청약 마감', d: '2099-02-01', t: '17:00' }], c4 = { ...el1, id: 'elyes-c4', title: '[용산원효루미니] 추가모집공고(접수일 26.11.09)-->마감되었습니다.', closed: true, ev };
  await mix([fi('o1', '2099-01-01'), { ...el2, ev }, c4, el1]); await W(120);
  const L = qa('#subFeed .flist > li'); q('#subFeed [data-ftab="done"]').click(); await W(50); const c = q('#subFeed [data-fid="elyes-c4"]');
  ok("마감 표시 공고: 진행 중에서 빠지고 완료 탭 · '마감됨' 배지 · '오늘 마감' 아님 · 캘린더 버튼 없음", !L.some(l => l.dataset.fid === 'elyes-c4') && !!c && c.textContent.includes('마감됨') && !c.textContent.includes('오늘 마감') && !c.querySelector('[data-ics]'), L.map(l => l.dataset.fid).join());
  q('#subFeed [data-ftab="now"]').click(); await W(50);
  ok('마감 일시를 읽은 단지 직접 공고: 캘린더에 추가 · 못 읽은 공고만 "일정은 공고 원문에서"', !!q('#subFeed [data-fid="elyes-a2"] [data-ics]') && !q('#subFeed [data-fid="elyes-a1"] [data-ics]') && q('#subFeed [data-fid="elyes-a1"]').textContent.includes('일정은 공고 원문에서'));
  await mix([fi('o1', '2099-01-01'), el2, el1]); await W(120); }
ok('공고 출처: 맨 아래 안내에 "롯데건설 엘리스(제목·링크)"', q('footer').textContent.includes('롯데건설 엘리스(제목·링크)'));
ok('관심 단지 띠: ★ 한 뒤에 올라온 공고 → 띠', !q('#danjiNew').hidden && !!q('#danjiNew [data-dnseen="elyes-a1"]'), q('#danjiNew').textContent);
q('#danjiNew [data-dnseen="elyes-a1"]').click(); await W(80);
q('[data-tab-link="danji"]').click(); await W(150); q('#danjiList [data-dstar="x-elyes-yeomchang"]').click(); await W(50); q('#danjiList [data-dstar="x-elyes-yeomchang"]').click(); await W(50); q('[data-tab-link="notices"]').click(); await W(150);
ok('관심 단지 띠: ★ 다시 눌러도 이미 본 공고는 그대로 숨김', q('#danjiNew').hidden);
const evs = []; fw.addEventListener('cc-danji-new', e => evs.push(e.detail));
const el3 = { ...el1, id: 'elyes-a3', title: '[어바니엘 염창] 재임대 모집공고 (접수기간: 12/1~12/3)', to: '2099-03-03', from: T }; await mix([fi('o1', '2099-01-01'), el2, el1, el3]); await W(120);
{ const nb = q('#danjiNew'), btn = nb.querySelector('[data-dnstar="elyes-a3"]');
  ok('관심 단지 띠: 공고 탭 맨 위 "관심 단지 새 공고" · 새 공고만 · "이 공고 마감 알림도 받기"', !nb.hidden && nb.querySelector('h2').textContent === '관심 단지 새 공고' && nb.compareDocumentPosition(q('#h-links')) & 4 && nb.querySelectorAll('li').length === 1 && btn?.textContent === '이 공고 마감 알림도 받기', nb.textContent);
  ok('앱 알림용 이벤트 cc-danji-new (공고 id · 단지 이름)', evs.length >= 1 && evs.at(-1)[0].id === 'elyes-a3' && evs.at(-1)[0].danji === '어바니엘 염창', JSON.stringify(evs.at(-1)));
  btn.click(); await W(80); }
ok('"이 공고 마감 알림도 받기" → 공고 ★ 바로 켜짐 (목록 ★ 도)', JSON.parse(fw.localStorage.getItem('cheongyak-check-stars')).includes('elyes-a3') && q('#subFeed [data-star="elyes-a3"]')?.getAttribute('aria-pressed') === 'true' && /받는 중/.test(q('#danjiNew').textContent));
q('#danjiNew [data-dnseen="elyes-a3"]').click(); await W(80);
ok('관심 단지 띠: 확인 → 숨김 · 이 기기에 기억', q('#danjiNew').hidden && JSON.parse(fw.localStorage.getItem('cheongyak-check-danji-seen')).includes('elyes-a3'));
// ---------- 백업 안내: 공고 ★ + 단지 ★ 3개 이상이면 ★ 누른 그 탭 맨 위에 한 번만 ----------
for (const k of ['cheongyak-check-stars', 'cheongyak-check-danji-stars', 'cheongyak-check-backup-tip']) fw.localStorage.removeItem(k);
await open('#notices'); { const qq = s => d.querySelector(s), tipN = () => qq('[data-backup-tip="notices"]'), tipD = () => qq('[data-backup-tip="danji"]');
  fw.eval('setFeed')({ updated: '', source: '', items: ['b1', 'b2', 'b3'].map((id, k) => ({ id, org: 'LH', title: '백업 ' + id, region: '서울', kind: '', posted: '2026-11-01', from: '', to: '2099-01-0' + (k + 1), url: 'https://apply.lh.or.kr' })) }); await W(120);
  qq('#subFeed [data-star="b1"]').click(); await W(60); qq('#subFeed [data-star="b2"]').click(); await W(60);
  ok('백업 안내: ★ 2개면 안 뜸', tipN().hidden && tipD().hidden);
  fw.location.hash = 'danji'; await W(250); qq('#danjiList [data-dstar]').click(); await W(80);
  ok('백업 안내: 3개째 ★ 를 누른 단지 탭 맨 위에만 · "가끔 백업해 두세요 · 백업 받기"', !tipD().hidden && tipN().hidden && tipD().textContent.includes('가끔 백업해 두세요') && !!tipD().querySelector('[data-backup-go]') && qq('#danjiSec').firstElementChild.nextElementSibling === tipD());
  tipD().querySelector('[data-backup-no]').click(); await W(60);
  ok('백업 안내: 닫기 → 숨김 · 기억', tipD().hidden && JSON.parse(fw.localStorage.getItem('cheongyak-check-backup-tip')) === 'closed'); }
await open('#notices'); { const qq = s => d.querySelector(s);
  fw.eval('setFeed')({ updated: '', source: '', items: [{ id: 'b4', org: 'LH', title: '백업 b4', region: '서울', kind: '', posted: '2026-11-01', from: '', to: '2099-01-09', url: 'https://apply.lh.or.kr' }] }); await W(120);
  qq('#subFeed [data-star="b4"]').click(); await W(60);
  ok('백업 안내: 닫은 뒤에는 ★를 더 눌러도 다시 안 뜸', qq('[data-backup-tip="notices"]').hidden);
  fw.localStorage.removeItem('cheongyak-check-backup-tip'); qq('#subFeed [data-star="b4"]').click(); await W(60); qq('#subFeed [data-star="b4"]').click(); await W(60);
  const tip = qq('[data-backup-tip="notices"]'); let bl = null; const ou = fw.URL.createObjectURL; fw.URL.createObjectURL = b => { bl = b; return 'blob:x'; };
  tip.querySelector('[data-backup-go]').click(); fw.URL.createObjectURL = ou;
  ok('백업 안내: 공고 탭에서 3개째 → 공고 탭 맨 위 · "백업 받기" → 바로 내보내기 파일(★ 포함) · 다시 안 뜨게 기억', !tip.hidden && !!bl && JSON.parse(await bl.text()).data.stars.includes('b4') && /내보냈어요/.test(tip.textContent) && JSON.parse(fw.localStorage.getItem('cheongyak-check-backup-tip')) === 'done'); }
// ---------- XSS: 바깥 피드·단지 값에 스크립트 · javascript: 주소 → 실행 요소·javascript 링크 0개 (2026-11-12) ----------
await open('#notices'); { const qq = s => d.querySelector(s), bad = () => {
    const els = [...d.querySelectorAll('*')], on = els.filter(e => [...e.attributes].some(a => /^on/i.test(a.name))), js = [...d.querySelectorAll('a[href], [src], form[action]')].filter(e => /^\s*(javascript|data|vbscript):/i.test(e.getAttribute('href') || e.getAttribute('src') || e.getAttribute('action') || ''));
    return { on: on.map(e => e.outerHTML.slice(0, 80)), js: js.map(e => e.outerHTML.slice(0, 80)), scripts: d.querySelectorAll('script').length }; };
  const S0 = d.querySelectorAll('script').length; fw.__xss = 0; const X = '<img src=x onerror="window.__xss=1"><svg onload="window.__xss=2"></svg><scr' + 'ipt>window.__xss=3</scr' + 'ipt>';
  fw.eval('setFeed')({ updated: '', source: '', items: [
    { id: 'xs1', org: 'LH', title: X + '나쁜 공고', region: '서울 ' + X, kind: X, posted: '2026-11-01', from: '', to: '2099-01-05', url: 'javascript:window.__xss=4' },
    { id: 'xs2', org: 'SH', title: '[정정공고] ' + X, region: '서울', kind: '행복주택', posted: '2026-11-02', from: '', to: '2099-01-06', url: ' JaVaScRiPt:window.__xss=5' }] });
  fw.eval(`danji = normDanji({ updated: '2026-11-12', danji: [{ id: 'xd1', gu: '마포구', name: ${JSON.stringify(X)} + '나쁜 단지', home: 'javascript:window.__xss=6', tel: '02-123-4567', status: '청약중' }], other: [] }); renderDanji();`);
  await W(150);
  // 들어올 때 거르는 곳을 건너뛰어도 (화면에서 한 번 더): 정리된 값에 직접 javascript: 를 넣고 다시 그림
  fw.eval(`subFeed.items.forEach(i => i.url = 'javascript:window.__xss=7'); danji.danji.forEach(x => x.home = 'javascript:window.__xss=8'); renderFeed(); renderDanji();`); await W(150);
  fw.location.hash = 'danji'; await W(250); fw.location.hash = 'notices'; await W(250);
  for (const a of d.querySelectorAll('#subFeed a, #danjiList a')) a.dispatchEvent(new fw.MouseEvent('click', { bubbles: true, cancelable: true }));   // 눌러도 실행 안 됨 (javascript: 링크가 없으니)
  await W(150); const b = bad();
  ok('XSS: 피드 제목·지역·종류에 <img onerror>·<svg onload>·<script> → 글자로만 · 실행 속성(on…)·javascript: 링크·새 script 0개 · 실행 안 됨', !b.on.length && !b.js.length && b.scripts === S0 && fw.__xss === 0 && qq('#subFeed').textContent.includes('<img src=x onerror='), JSON.stringify(b) + ' xss=' + fw.__xss);
  ok('XSS: url·home 이 javascript: 면 링크 대신 글자 (공고 이름은 글자 · 단지 홈페이지 링크 없음)', !!qq('#subFeed [data-fid="xs1"] span.nm') && !qq('#subFeed [data-fid="xs1"] a.nm') && !qq('#danjiList li[data-did="xd1"] .dj-links a[href*="script"]') && !!qq('#danjiList li[data-did="xd1"] a[href^="tel:"]'), qq('#subFeed [data-fid="xs1"] .nmrow')?.outerHTML.slice(0, 120)); }
"""

MOBILE = r"""
const q = s => d.querySelector(s), before = localStorage.getItem('newlywed-home-v1');
const qa = s => [...d.querySelectorAll(s)], vis = () => qa('[data-tab]').filter(s => !s.hidden).map(s => s.dataset.tab).join();
ok('390 첫 화면은 공고 탭 (다른 탭 숨김)', q('h1').getBoundingClientRect().bottom <= fw.innerHeight && vis() === 'notices');
{ const ls = qa('[data-tab-link]'), nav = q('.chips');
  ok('390 메뉴 3개가 한 줄 · 넘침 없음 · 터치 높이 40px 이상', ls.length === 3 && new Set(ls.map(a => Math.round(a.getBoundingClientRect().top))).size === 1 && nav.scrollWidth <= nav.clientWidth && ls.every(a => a.getBoundingClientRect().height >= 40) && ls.every(a => a.getBoundingClientRect().right <= fw.innerWidth), ls.map(a => Math.round(a.getBoundingClientRect().right)).join()); }
ok('390 가로 넘침 없음 (첫 화면)', d.documentElement.scrollWidth <= fw.innerWidth, d.documentElement.scrollWidth);
ok('기존 사이트 입력 발견 → 진단 탭 맨 위 배너 + 공고 탭 위 한 줄', !q('#importBanner').hidden && q('#h-diag').nextElementSibling === q('#importBanner') && !q('#importHint').hidden && q('#importHint').textContent.includes('SUITABLE HOME 조건 가져오기 → 진단') && q('#importHint').getAttribute('href') === '#diag');
{ fw.eval('CAN_READ_SH = false; renderImport()');
  const ln = [...q('#importLinks').querySelectorAll('a')];
  ok('새 주소(저장 공간이 다름): 1클릭 가져오기 대신 작은 링크 "SUITABLE HOME 쓰셨나요? 조건 불러오기 →" · "예전 주소에서 옮기셨나요? 옮긴 파일 불러오기 →" (#ioSet) · 공고 탭 한 줄 숨김', q('#importBanner').hidden && !q('#importLinks').hidden && ln.map(a => a.textContent).join('|') === 'SUITABLE HOME 쓰셨나요? 조건 불러오기 →|예전 주소에서 옮기셨나요? 옮긴 파일 불러오기 →' && ln.every(a => a.getAttribute('href') === '#ioSet') && q('#importHint').hidden && localStorage.getItem('newlywed-home-v1') === before);
  fw.location.hash = 'diag'; await W(150); ln[1].click(); await W(200);
  ok('"옮긴 파일 불러오기 →" → #settings 의 불러오기 칸 (#ioSet)', fw.location.hash === '#settings' && vis() === 'settings' && q('#ioSet').getBoundingClientRect().top < fw.innerHeight && q('#ioSet').getBoundingClientRect().bottom > 0, fw.location.hash);
  fw.history.back(); await W(200);
  ok('#settings 에서 뒤로가기 → 진단', vis() === 'diag' && fw.location.hash === '#diag', fw.location.hash);
  fw.eval('CAN_READ_SH = true; renderImport()'); }
q('#importHint').click(); await W(150);
ok('공고 탭 한 줄 → 진단 탭', vis() === 'diag' && fw.location.hash === '#diag');
q('#importGo').click(); await W(600);
ok('가져오기 문구: 조사가 받침에 맞음 ("공고 1개를")', /공고 \d+개(를| · 내 조건을) 가져왔어요/.test(q('#subMsg').textContent) && !/개을 |\(를\)/.test(q('#subMsg').textContent), q('#subMsg').textContent);
ok('조사 고르기: 받침 · 숫자 · 괄호 · 영문', [['자동차가액', '을'], ['결혼 여부', '를'], ['공고 1개', '를'], ['공고 3', '을'], ['공고 2', '를'], ['규제지역 (서울 등)', '을'], ['2억원', '을'], ['LH', '를']].every(([w, j]) => fw.eval('jo')(w, '을', '를') === j));
const S = fw.eval('state.subs'), O = JSON.parse(before).subs;
ok('가져오기: 공고·내 상황 그대로', S.notices.length === O.notices.length && JSON.stringify(S.me) === JSON.stringify(O.me) && S.tab === O.tab, S.notices.length);
ok('가져오기: 돈 조건', fw.eval('state.settings.depMax') === JSON.parse(before).settings.depMax);
ok('기존 사이트 데이터는 그대로 (글자 하나 안 바뀜)', localStorage.getItem('newlywed-home-v1') === before);
ok('가져온 뒤 배너·공고 탭 한 줄 숨김 · 결과 보임', q('#importBanner').hidden && q('#importHint').hidden && !!q('#subJudge .sig'));
for (const x of d.querySelectorAll('details')) x.open = true; await W(100);
for (const tb of ['diag', 'notices', 'danji', 'settings']) { fw.location.hash = tb; await W(150);
  ok(`390 가로 넘침 없음 (${tb} 탭 · 접힌 칸 모두 펼침)`, vis() === tb && d.documentElement.scrollWidth <= fw.innerWidth, d.documentElement.scrollWidth); }
fw.location.hash = 'diag'; await W(150);
ok('휴대폰 진단 탭: 내 공고 → 결과 순서', q('#subListBox').getBoundingClientRect().top < q('#subJudge').getBoundingClientRect().top);
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

DEMO_NEW = r"""
const q = s => d.querySelector(s);
q('#subSample').click(); await W(1200);
ok('예시 체험은 약관 카드 없이 결과 + "예시 상황 … 저장되지 않아요" 표시', !q('.terms-card') && !!q('#subJudge .sub-main .sig') && q('#subDemo').textContent.includes('저장되지 않아요') && fw.localStorage.getItem('cheongyak-check-terms') === null);
"""

SW = r"""
const hits = async () => (await (await fetch('/__hits?' + Math.random(), { cache: 'no-store' })).json());   // 물음표: 서비스 워커 저장본을 피함
await fw.navigator.serviceWorker.ready; await W(500); await open(''); await W(500);
ok('서비스 워커가 화면을 맡음', !!fw.navigator.serviceWorker.controller);
const ks = await caches.keys(); ok('저장소 이름에 버전', ks.length === 1 && /^cheongyak-check-/.test(ks[0]), ks.join(','));
{ const DET = 'feed/detail/zz-swtest.json', c0 = await caches.open(ks[0]), old = () => new Response(JSON.stringify({ id: 'zz-swtest', target: '예전 상세', eligibility: ['예전'] }), { headers: { 'Content-Type': 'application/json' } });
  for (const u of [DET, DET + '?v=aaaaaaaaaa', DET + '?v=bbbbbbbbbb']) await c0.put(new Request(new URL(u, location.href)), old());   // 예전 상세가 저장돼 있는 브라우저 흉내
  fw.eval('setFeed')({ updated: '', source: '', items: [{ id: 'zz-swtest', org: 'LH', title: '캐시 검사', region: '서울', kind: '', posted: '', from: '', to: '2099-01-01', url: 'https://apply.lh.or.kr', detail: true, dv: 'bbbbbbbbbb' }] }); await W(50);
  d.querySelector('#subFeed [data-detail="zz-swtest"]').click(); await W(800); const bx = d.querySelector('#subFeed [data-det="zz-swtest"]');
  ok('예전 상세가 저장돼 있어도 새 상세로 바뀜 (dv · 상세는 인터넷 먼저)', bx.textContent.includes('새 상세') && !bx.textContent.includes('예전 상세'), bx.textContent.slice(0, 60)); }
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

# 기준(SUITABLE HOME v28 백업)은 조사를 '을(를)'로 썼다 → 이 사이트는 받침에 맞게 고침 (2026-11-09). 그 차이만 맞춰 놓고 비교한다
def _jo(w, a, b):
    ch = w.strip()[-1]; k = ord(ch) - 0xAC00
    return (a if k % 28 else b) if 0 <= k <= 11171 else (a if ch in "013678" else b)
def josa_fixed(x):
    if isinstance(x, str): return re.sub(r"(\S)을\(를\)", lambda m: m.group(1) + _jo(m.group(1), "을", "를"), x)
    if isinstance(x, list): return [josa_fixed(v) for v in x]
    if isinstance(x, dict): return {k: josa_fixed(v) for k, v in x.items()}
    return x

# 2026-11-09 판정 문구를 단정하지 않게 바꿈 (판정은 그대로) → 기준 쪽 글자를 새 문구로 정확히 바꿔 놓고 비교. 이 밖의 글자 차이는 모두 실패
SIG_NEW = {"신청할 수 있어요": "입력한 조건으로는 신청 가능해 보여요", "신청은 할 수 있어요 · 예산은 넘어요": "입력한 조건으로는 신청 가능해 보여요 · 예산은 넘어요",
           "확인이 필요해요": "입력한 조건만으로는 아직 판단하기 어려워요 · 확인이 필요해요", "이 공고는 어려워요": "입력한 조건으로는 어려워 보여요"}
BADGE_NEW = {"가능": "가능해 보임", "불가": "어려워 보임"}
def wording_new(r):
    if not r: return r
    r = dict(r); r["sig"] = [SIG_NEW.get(s, s) for s in r["sig"]]
    if "badges" in r: r["badges"] = [BADGE_NEW.get(s, s) for s in r["badges"]]
    if "why" in r: r["why"] = [re.sub(r"어려워요\.$", "어려워 보여요.", re.sub(r"신청할 수 있어요\.", "신청 가능해 보여요.", s.replace("특별공급을 신청할 수 있어요.", "특별공급은 신청 가능해 보여요."))) for s in r["why"]]
    return r

def main():
    swt = REPO / "feed/detail/zz-swtest.json"; swt.parent.mkdir(exist_ok=True); swt.write_text('{"id":"zz-swtest","target":"새 상세","eligibility":["새로"]}', encoding="utf-8")   # 서비스 워커 상세 캐시 검사용 (끝나면 지움)
    procs = [serve(NEW_PORT, REPO)]
    have_old = (OLD_REPO / OLD_PAGE.lstrip("/")).exists()
    if have_old: procs.append(serve(OLD_PORT, OLD_REPO))
    logs_all = []
    try:
        for label, body, kw in [("PC 1280", PC, {"budget": 120000}),   # 캘린더·배지·필터 검사가 늘어 가상 시간 60초 → 120초
                               ("휴대폰 390", MOBILE, {"w": 390, "h": 844, "seeds": {"newlywed-home-v1": old_seed, **TERMS}}),
                               ("예시 체험", DEMO_NEW, {}), ("서비스 워커", SW, {"budget": None})]:
            res, logs = run(body, REPO, NEW_PORT, "/index.html", **kw); logs_all += logs
            for st, n, g in res: rows.append((st, f"[{label}] {n}", g))
        if have_old:
            sc = COLLECT % json.dumps(SCEN, ensure_ascii=False)
            a, la = run(sc, OLD_REPO, OLD_PORT, OLD_PAGE, seeds={"suitable-intro": "1", "newlywed-home-v1": old_seed}, hash_="#subs", budget=120000)
            b, lb = run(sc, REPO, NEW_PORT, "/index.html", seeds={NEW_KEY: mine, **TERMS}, budget=120000)
            da, db = run(DEMO, OLD_REPO, OLD_PORT, OLD_PAGE, seeds={"suitable-intro": "1"}, hash_="#subs"), run(DEMO, REPO, NEW_PORT, "/index.html")
            logs_all += la + lb + da[1] + db[1]
            data = lambda res: json.loads(next((g for s, n, g in res if s == "DATA"), "{}"))
            ja, jb = {k: wording_new(v) for k, v in josa_fixed({**data(a), **data(da[0])}).items()}, {**data(b), **data(db[0])}
            ok("[판정 동등성] 결과를 모음", len(ja) == len(jb) == 2 + len(SCEN) * 2, f"old {len(ja)} · new {len(jb)}")
            for k in ja:
                ok(f"[판정 동등성] {k}", ja[k] is not None and ja[k] == jb.get(k), "" if ja[k] == jb.get(k) else json.dumps({"old": ja[k], "new": jb.get(k)}, ensure_ascii=False)[:600])
            for r in a + b + da[0] + db[0]:
                if r[0] == "NG": rows.append(("NG", "[판정 동등성 실행] " + r[1], r[2]))
        else:
            ok("판정 동등성 (../sjcu/index_v28_backup.html 없음 → 건너뜀)", True)
    finally:
        for p in procs: p.terminate()
        swt.unlink(missing_ok=True)
    ok("콘솔 자체검사 실패·오류 0건", not logs_all, " | ".join(l[-200:] for l in logs_all[:5]))
    for st, n, g in rows: print(st, n, ("→ " + g) if g and st == "NG" else "")
    bad = [r for r in rows if r[0] == "NG"]
    print(f"\n{len(rows) - len(bad)}/{len(rows)} OK")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
