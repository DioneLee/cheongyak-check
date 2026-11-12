// 서비스 워커 × 리다이렉트 검사 (2026-11-12 새 주소에서 약관·개인정보가 ERR_FAILED 였던 것)
//   node scripts/verify/sw_redirect_check.mjs        — 임시 Chrome 프로필 + 테스트 서버(Cloudflare Pages 흉내: /x.html → 308 /x)
// ① 예전 서비스 워커(git HEAD 의 sw.js)로는 약관이 깨지는지(재현) ② 지금 sw.js 로 바뀌면 약관·개인정보·처음 화면이 열리는지
// ③ 서버가 끊겨도(503) 저장본으로 열리는지 ④ 예전 서비스 워커가 깔린 사람도 다시 열면 새 것으로 바뀌는지
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), PORT = 8771, CDP = 9335, BASE = `http://localhost:${PORT}`;
const CHROME = process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const rows = [], ok = (n, c, g = '') => rows.push([c ? 'OK' : 'NG', n, c ? '' : String(g)]), W = ms => new Promise(r => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), 'cc-sw-')), oldSw = join(tmp, 'sw.old.js');
writeFileSync(oldSw, execFileSync('git', ['-C', REPO, 'show', 'HEAD:sw.js']));
const server = spawn(process.platform === 'win32' ? 'python' : 'python3', [join(REPO, 'scripts/verify/serve.py'), String(PORT), REPO], { stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${join(tmp, 'prof')}`, `--remote-debugging-port=${CDP}`, 'about:blank'], { stdio: 'ignore' });
const get = p => fetch(BASE + p).catch(() => null);
try {
  for (let i = 0; i < 50 && !(await get('/__hits')); i++) await W(100);
  let page; for (let i = 0; i < 50 && !page; i++) { await W(150); try { page = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(p => p.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let n = 0; const call = (method, params = {}) => new Promise(r => { const id = ++n; const h = e => { const m = JSON.parse(e.data); if (m.id === id) { ws.removeEventListener('message', h); r(m.result ?? m); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async x => (await call('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
  const go = async (path, ms = 1500) => { const r = await call('Page.navigate', { url: BASE + path }); await W(ms); return r.errorText || ''; };
  const swVer = () => ev(`caches.keys().then(k => k.filter(x => x.startsWith('cheongyak-check-')).join())`);
  await call('Page.enable');
  await get('/__pages/on'); await get('/__sw?f=' + encodeURIComponent(oldSw));
  await go('/', 2500); await go('/', 2000);   // 예전 서비스 워커 깔기 → 다음 열기부터 이 워커가 받음
  const oldV = await swVer(), oldErr = await go('/terms.html', 1500);
  ok('① 재현: 예전 서비스 워커 + Pages 리다이렉트 → 약관 열기 실패', !!oldV && !!oldErr, `${oldV} · ${oldErr || '열림'}`);
  await get('/__sw');   // 이제 지금 sw.js
  await go('/', 3000); await go('/', 2500);   // 다시 열면 새 서비스 워커 설치·적용 (skipWaiting · clients.claim)
  const newV = await swVer();
  ok('④ 예전 서비스 워커가 깔린 사람도 다시 열면 새 버전으로 바뀜 (예전 저장소 지움)', /2026-11-12c/.test(newV) && !newV.includes(oldV), newV);
  for (const [p, t] of [['/terms.html', '이용약관'], ['/privacy.html', '개인정보'], ['/index.html', '청약 체크'], ['/', '청약 체크']]) {
    const err = await go(p), title = await ev('document.title');
    ok(`② ${p} 열림 (Pages 308 따라감)`, !err && title.includes(t), `${err} · ${title}`);
  }
  await go('/'); await ev(`document.querySelector('footer a[href="terms.html"]').click()`); await W(1500);
  ok('② 맨 아래 "이용약관" 링크를 눌러 열림', (await ev('document.title')).includes('이용약관'), await ev('location.href'));
  await get('/__offline/on');
  for (const [p, t] of [['/terms.html', '이용약관'], ['/privacy.html', '개인정보'], ['/', '청약 체크']]) {
    const err = await go(p), title = await ev('document.title');
    ok(`③ 서버가 끊겨도(503) ${p} 저장본으로 열림`, !err && title.includes(t), `${err} · ${title}`);
  }
  await get('/__offline/off'); await get('/__pages/off'); ws.close();
} catch (e) { ok('검사 실행', false, e.stack); }
finally { chrome.kill(); server.kill(); await W(500); try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
for (const [s, n, g] of rows) console.log(s, n, g ? '→ ' + g : '');
const bad = rows.filter(r => r[0] === 'NG').length; console.log(bad ? `\n${bad}개 실패` : `\n${rows.length}개 모두 OK`); process.exit(bad ? 1 : 0);
