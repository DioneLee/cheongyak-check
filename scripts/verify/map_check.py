"""지도로 보기 검사 (2026-11-13): 공고 탭·단지 탭의 '목록 / 지도' — 구별 동그라미(개수) · 역 핀 · 핀 이름 → 목록 · 기본 조건 맞아 보임만 · CSP 막힘 0.
_headers 머리를 붙여 주는 csp_check 의 테스트 서버(포트 8796) + 임시 Chrome 프로필. 저장소의 feed/*.json 만 쓰고 내 데이터는 없음.
Leaflet(cdnjs)·지도 그림(OSM)은 인터넷에서 받는다.
사용: python scripts/verify/map_check.py
"""
import http.server, json, re, subprocess, sys, tempfile, threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from csp_check import H, REPO, CHROME

PORT = 8796
JS = r"""
const asc = o => JSON.stringify(o).replace(/[<>&]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const W = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (name, cond, got) => { out.push([cond ? 'OK' : 'NG', name, String(got ?? '')]); document.title = 'AT ' + asc(out); };
const until = async (f, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (f()) return true; await W(200); } return false; };
(async () => {
  for (const w of [1280, 390]) {
    const f = document.createElement('iframe'); f.style.cssText = `border:0;width:${w}px;height:900px`; f.src = '/#notices'; document.body.append(f);
    await new Promise(r => f.onload = r); await W(1500);
    const d = f.contentDocument, fw = f.contentWindow, q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
    const errs = [], csp = []; fw.addEventListener('error', e => errs.push(e.message)); d.addEventListener('securitypolicyviolation', e => csp.push(e.blockedURI + ' ' + e.violatedDirective));
    await until(() => q('#subFeed [data-fview]'));
    const num = s => qa(s).reduce((a, e) => a + +e.textContent.match(/\d+$/)[0], 0);
    const prep = m => { m._zoomAnimated = false; };   // 하네스 iframe 에선 확대 애니메이션(requestAnimationFrame)이 안 돌 때가 있음
    ok(`${w}: 공고 탭 '목록 / 지도' · 기본은 목록 · Leaflet 은 아직 안 받음`, q('#subFeed [data-fview="list"]').getAttribute('aria-pressed') === 'true' && q('#feedMap').hidden && typeof fw.L === 'undefined', '');
    q('#subFeed [data-fview="map"]').click();
    const loaded = await until(() => qa('#feedMap .mgu').length);
    await W(1500);   // 처음 맞춤(확대 애니메이션)이 끝나 동그라미가 다시 그려진 뒤에 고름
    const m = fw.eval('maps.get("feedMap")'); if (m) prep(m);
    const L0 = fw.eval(`(() => { const t = todayYmd(); return subFeed.items.filter(i => i.region.startsWith('서울') && phaseOf(i, t) === feedTab).map(i => guOf(i)); })()`), withGu = L0.filter(g => fw.eval('GU_XY')[g]).length;
    ok(`${w}: '지도' → 목록 숨김 · 지도 보임 · 구별 동그라미 숫자 합 = 지금 탭 공고 중 구를 아는 것 ${withGu}건`, loaded && q('#subFeed #feedBody').hidden && !q('#feedMap').hidden && num('#feedMap .mgu') === withGu,
      `${qa('#feedMap .mgu').map(e => e.textContent).join(' / ')}`);
    ok(`${w}: 안내 = '${fw.eval('feedTab')}' 공고 ${L0.length}건 · 가까운 역 위치 · 진단 안 했으면 진단 링크`, q('#feedMap .mapnote').textContent.includes(`공고 ${L0.length}건`) && /가까운 역 위치/.test(q('#feedMap .mapnote').textContent) && !!q('#subFeed .mapbar a[href="#diag"]'), q('#feedMap .mapnote').textContent);
    // 동그라미 → 확대 → 역 핀 → 이름 → 목록
    const big = qa('#feedMap .mgu').sort((a, b) => +b.textContent.match(/\d+$/)[0] - +a.textContent.match(/\d+$/)[0])[0];
    big.click(); await W(1200);
    ok(`${w}: 동그라미 누름 → 확대(13 이상) · 역 핀 ('○○역 근처 N' 또는 '구 · 역 정보 없음')`, m.getZoom() >= 13 && qa('#feedMap .mpin').length > 0, `zoom ${m.getZoom()} · ${qa('#feedMap .mpin').map(e => e.textContent).join(' / ')}`);
    qa('#feedMap .mpin')[0].click(); await W(600);
    const btn = q('#feedMap .leaflet-popup [data-mapgo]'), id = btn?.dataset.mapgo;
    ok(`${w}: 핀 누름 → 공고 이름 목록 (버튼)`, !!btn && btn.textContent.length > 0, btn?.textContent);
    btn.click(); await W(600);
    const li = q(`#subFeed [data-fid="${id}"]`);
    ok(`${w}: 이름 누름 → 목록으로 돌아와 그 공고에 초점 · 표시`, fw.eval('feedView') === 'list' && !q('#subFeed #feedBody').hidden && q('#feedMap').hidden && d.activeElement === li && li.classList.contains('flash'), d.activeElement?.dataset?.fid);
    // 탭 바꿔도 지도 유지 · 진단 마친 상태 → 기본 조건 맞아 보임만
    q('#subFeed [data-fview="map"]').click(); await W(400);
    fw.eval("state.subs.wizard.done = true; state.subs.me = demoMe(state.subs.tab); renderFeed()"); await W(400);
    const okN = fw.eval(`(() => { const t = todayYmd(); return subFeed.items.filter(i => i.region.startsWith('서울') && phaseOf(i, t) === feedTab && FeedTools.judge(state.subs.me, i.cr, { tier: state.subs.tab, today: t, seen: state.subs.seen || {} }).st === 'ok').filter(i => GU_XY[guOf(i)]).length; })()`);
    m.setZoom(11); await W(600);
    const cb = q('#subFeed [data-mapok]'); cb.click(); await W(800);
    ok(`${w}: 맞아 보임만 → 동그라미 숫자 합 ${okN}`, num('#feedMap .mgu') === okN && /맞아 보임만 \(\d+건\)/.test(q('#subFeed .mapok').textContent), `${num('#feedMap .mgu')} · ${q('#subFeed .mapok').textContent}`);
    q('#subFeed [data-mapok]').click(); await W(400);
    q('#subFeed [data-ftab="plan"]').click(); await W(600);
    ok(`${w}: 지도에서 '예정' 탭 → 지도 그대로 · 안내가 예정으로`, fw.eval('feedView') === 'map' && /예정 공고/.test(q('#feedMap .mapnote').textContent), q('#feedMap .mapnote').textContent);
    q('#subFeed [data-fview="list"]').click(); await W(300);
    ok(`${w}: '목록' → 지도·막대 숨김`, q('#feedMap').hidden && q('#subFeed .mapbar').hidden && !q('#subFeed #feedBody').hidden, '');
    // 단지 탭
    fw.location.hash = 'danji'; await W(600);
    q('#danjiBox [data-dview="map"]').click();
    await until(() => qa('#danjiMap .mgu').length);
    await W(1500);
    const dm = fw.eval('maps.get("danjiMap")'); prep(dm);
    const dn = fw.eval('[...danji.danji, ...danji.other].filter(d => GU_XY[d.gu]).length'), dAll = fw.eval('danji.danji.length + danji.other.length');
    ok(`${w}: 단지 탭 지도 → 동그라미 숫자 합 = 단지 ${dn}곳 · 안내 '단지 ${dAll}곳'`, num('#danjiMap .mgu') === dn && q('#danjiMap .mapnote').textContent.includes(`단지 ${dAll}곳`) && q('#danjiList').hidden, `${num('#danjiMap .mgu')}`);
    q('#danjiBox [data-df="gu"]').value = '강남구'; q('#danjiBox [data-df="gu"]').dispatchEvent(new fw.Event('input', { bubbles: true })); await W(600);
    const gn = fw.eval("[...danji.danji, ...danji.other].filter(d => d.gu === '강남구').length");
    ok(`${w}: 구 고르면 지도도 그 구만 (강남구 ${gn}곳)`, num('#danjiMap .mgu') === gn && qa('#danjiMap .mgu').length === 1, qa('#danjiMap .mgu').map(e => e.textContent).join(' / '));
    qa('#danjiMap .mgu')[0].click(); await W(1200);
    qa('#danjiMap .mpin')[0].click(); await W(600);
    const db = q('#danjiMap .leaflet-popup [data-mapgod]'), did = db?.dataset.mapgod; db?.click(); await W(600);
    ok(`${w}: 단지 핀 → 이름 → 목록의 그 단지`, !!did && d.activeElement === q(`#danjiBox [data-did="${did}"]`) && !q('#danjiList').hidden, did);
    q('#danjiBox [data-df="gu"]').value = ''; q('#danjiBox [data-df="gu"]').dispatchEvent(new fw.Event('input', { bubbles: true }));
    ok(`${w}: CSP 막힘 0 (Leaflet·지도 그림·역 좌표) · 콘솔 오류 0`, !csp.length && !errs.length, [...csp, ...errs].join(' | '));
    ok(`${w}: 가로 넘침 없음`, d.documentElement.scrollWidth <= w, d.documentElement.scrollWidth);
    f.remove();
  }
  document.title = 'DONE ' + asc(out);
})().catch(e => { out.push(['NG', '하네스 오류', e.message + ' ' + (e.stack || '').split('\n')[1]]); document.title = 'DONE ' + asc(out); });
"""

class T(H):
    def send_header(s, k, v):   # 하네스가 iframe 으로 열고 eval 로 읽어야 해서 frame-ancestors 빼고 unsafe-eval 만 더함 (연결·스크립트 출처는 그대로 검사)
        if k == 'Content-Security-Policy': v = re.sub(r"; frame-ancestors 'none'", '', v).replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")   # eval 은 하네스가 앱 변수를 읽으려고
        if k == 'X-Frame-Options': return
        super().send_header(k, v)
    def end_headers(s):   # 하네스 쪽은 CSP 없이 (iframe 안 사이트에는 _headers 그대로)
        if s.path.startswith('/__map_test.html'): return http.server.SimpleHTTPRequestHandler.end_headers(s)
        super().end_headers()
    def do_GET(s):
        if s.path.startswith('/__map_test.html'):
            b = ('<!doctype html><meta charset="utf-8"><body><script>' + JS + '</scr' + 'ipt>').encode('utf-8')
            s.send_response(200); s.send_header('Content-Type', 'text/html; charset=utf-8'); s.end_headers(); s.wfile.write(b); return
        super().do_GET()

def main():
    srv = http.server.ThreadingHTTPServer(('localhost', PORT), T); threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory() as prof:
            r = subprocess.run([CHROME, '--headless=new', f'--user-data-dir={prof}', '--virtual-time-budget=180000', '--dump-dom', f'http://localhost:{PORT}/__map_test.html'], capture_output=True, text=True, encoding='utf-8', timeout=400)
    finally:
        srv.shutdown()
    m = re.search(r'<title>(?:DONE|AT) (.*?)</title>', r.stdout, re.S)
    rows = json.loads(m.group(1).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')) if m else [['NG', '결과 없음', r.stdout[-300:]]]
    bad = 0
    for st, name, got in rows:
        if st != 'OK': bad += 1
        print(f'[{st}] {name}' + (f'  → {got}' if st != 'OK' or '-v' in sys.argv else ''))
    print(f'\n{len(rows) - bad}/{len(rows)} 통과' + ('' if m and 'DONE' in r.stdout[m.start():m.start() + 12] else ' (끝까지 못 감)'))
    sys.exit(1 if bad or not rows else 0)

if __name__ == '__main__':
    main()
