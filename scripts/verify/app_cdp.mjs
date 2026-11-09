// 앱(에뮬레이터·휴대폰) 화면 안에서 JS 를 실행해 결과를 찍는다 — 앱 검사용 (디버그 빌드만: WebView 디버깅이 켜져 있음)
//   node scripts/verify/app_cdp.mjs "location.hash"
//   node scripts/verify/app_cdp.mjs --gesture "document.querySelector('#subPdf').click()"   (파일 고르기처럼 사용자 동작이 필요한 것)
// adb 는 ANDROID_HOME/platform-tools 또는 PATH 에서 찾는다. 앱 WebView 의 디버깅 소켓을 9333 으로 이어서 첫 페이지에 붙는다
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const sdk = process.env.ANDROID_HOME || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : join(process.env.HOME || '', 'Library', 'Android', 'sdk'));
const adb = (...a) => execFileSync(join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'), a, { encoding: 'utf8' });
const args = process.argv.slice(2), gesture = args[0] === '--gesture' && !!args.shift(), expr = args.join(' ');

const sock = adb('shell', 'cat', '/proc/net/unix').split('\n').map(l => l.match(/@(webview_devtools_remote_\d+)/)?.[1]).filter(Boolean).at(-1);
if (!sock) { console.error('앱 WebView 디버깅 소켓이 없어요 (앱이 켜져 있고 디버그 빌드인지 확인)'); process.exit(2); }
adb('forward', 'tcp:9333', `localabstract:${sock}`);
const page = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let n = 0; const call = (method, params) => new Promise(r => { const id = ++n; const h = e => { const m = JSON.parse(e.data); if (m.id === id) { ws.removeEventListener('message', h); r(m); } }; ws.addEventListener('message', h); ws.send(JSON.stringify({ id, method, params })); });
const res = await call('Runtime.evaluate', { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true, userGesture: gesture });
ws.close();
if (res.result?.exceptionDetails) { console.error('오류:', res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text); process.exit(1); }
const v = res.result?.result?.value; console.log(typeof v === 'string' ? v : JSON.stringify(v));
