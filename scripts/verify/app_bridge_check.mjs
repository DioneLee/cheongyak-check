// 앱 전용 연결 코드(app/bridge.js) 검사 — 가짜 Capacitor·localStorage 로 Node 에서 돌린다 (에뮬레이터 없이)
//   node scripts/verify/app_bridge_check.mjs
// + sync-web 결과: 앱 화면(www/index.html)에만 bridge 가 들어가고 웹 index.html 은 그대로인지
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), SRC = readFileSync(join(REPO, 'app/bridge.js'), 'utf8');
const rows = []; const ok = (n, c, g = '') => rows.push([c ? 'OK' : 'NG', n, c ? '' : String(g)]);
const tick = () => new Promise(r => setTimeout(r, 20));

function boot({ ls = {}, prefs = {}, native = true, net = true, granted = true } = {}) {
  class Storage { constructor(o) { this._ = { ...o }; } getItem(k) { return k in this._ ? this._[k] : null; } setItem(k, v) { this._[k] = String(v); } clear() { this._ = {}; } }
  const local = new Storage(ls), log = { reload: 0, scheduled: [], cancelled: [], asked: 0, shared: [], exit: 0 }, listeners = {};
  const P = {
    Preferences: { get: async ({ key }) => ({ value: prefs[key] ?? null }), set: async ({ key, value }) => { prefs[key] = value; } },
    LocalNotifications: { requestPermissions: async () => { log.asked++; }, checkPermissions: async () => ({ display: granted ? 'granted' : 'denied' }),
      getPending: async () => ({ notifications: log.scheduled.map(n => ({ id: n.id, extra: n.extra })) }), cancel: async ({ notifications }) => { log.cancelled.push(...notifications.map(n => n.id)); log.scheduled = log.scheduled.filter(n => !notifications.some(c => c.id === n.id)); },
      schedule: async ({ notifications }) => { log.scheduled.push(...notifications); } },
    Filesystem: { writeFile: async ({ path }) => ({ uri: 'file:///cache/' + path }) }, Share: { share: async o => { log.shared.push(o); } },
    App: { addListener: (e, f) => { listeners[e] = f; }, exitApp: () => { log.exit++; } },
  };
  const feedTxt = JSON.stringify({ items: [{ id: 'a', title: '[정정] 가 공고', to: '2099-03-10', time: '17:00' }, { id: 'b', title: '나 공고', to: '2099-03-11', startOnly: true }, { id: 'c', title: '다 공고', to: '2000-01-02' }] });
  const loc = { hash: '#settings', reload() { log.reload++; }, replace(h) { this.hash = h; } };
  const win = {
    Capacitor: native ? { isNativePlatform: () => true, Plugins: P } : undefined, localStorage: local, location: loc,
    fetch: async u => { if (!net) throw new TypeError('offline'); return new Response(String(u).includes('notices.json') ? feedTxt : 'x'); },
  };
  class A { click() { log.plain = (log.plain || 0) + 1; } }
  const ctx = vm.createContext({ window: win, Storage, localStorage: local, location: loc, history: { back() {} }, HTMLAnchorElement: A, Response, console: { warn() {} }, setTimeout, Promise, JSON, Date, Math, String, Set });
  vm.runInContext(SRC, ctx);
  return { ctx, win, local, prefs, log, P, listeners, A };
}

// 웹(앱 아님): 아무것도 안 바꿈
{ const b = boot({ native: false }); ok('웹에서는 아무것도 안 함 (fetch·setItem 그대로)', !b.win.__ccAlarms && b.local.setItem === b.ctx.Storage.prototype.setItem); }
// 1) 되살리기
{ const b = boot({ prefs: { 'cheongyak-check-v1': '{"saved":1}' } }); await tick();
  ok('localStorage 가 비었고 Preferences 에 있으면 되살리고 다시 읽음', b.local.getItem('cheongyak-check-v1') === '{"saved":1}' && b.log.reload === 1); }
{ const b = boot({ prefs: { 'cheongyak-check-v1': '{"saved":1}' } }); b.local.setItem('cheongyak-check-v1', '{"empty":1}'); await tick();
  ok('되살리는 중에 화면이 쓴 빈 상태는 백업하지 않음', b.prefs['cheongyak-check-v1'] === '{"saved":1}' && b.local.getItem('cheongyak-check-v1') === '{"saved":1}'); }
{ const b = boot({ ls: { 'cheongyak-check-v1': '{"now":1}' }, prefs: { 'cheongyak-check-v1': '{"old":1}' } }); await tick();
  ok('localStorage 에 있으면 그게 기준 → Preferences 로 백업', b.prefs['cheongyak-check-v1'] === '{"now":1}' && b.log.reload === 0);
  b.local.setItem('cheongyak-check-v1', '{"next":2}'); b.local.setItem('other', '1'); await tick();
  ok('저장할 때마다 Preferences 에도 (이 키만)', b.prefs['cheongyak-check-v1'] === '{"next":2}' && !('other' in b.prefs)); }
// 2) 피드 오프라인 · 3) 알림
{ const b = boot({ ls: { 'cheongyak-check-v1': '{}', 'cheongyak-check-stars': '[]' } }); await tick();
  await (await b.win.fetch('https://dionelee.github.io/cheongyak-check/feed/notices.json')).text(); await tick();
  ok('피드를 받으면 기억', JSON.parse(b.local.getItem('cheongyak-check-app-feed')).items.length === 3);
  b.local.setItem('cheongyak-check-stars', '["a","b","c"]'); await tick(); await tick();
  const s = b.log.scheduled;
  ok('처음 ★ 때 알림 허용을 한 번 물음', b.log.asked === 1);
  ok('알림: ★ 공고 중 마감일 아는 것·아직 안 지난 것만 (시작일만 아는 공고·지난 공고 제외)', s.length === 1 && s[0].extra.fid === 'a', JSON.stringify(s.map(x => x.extra.fid)));
  const at = s[0]?.schedule.at;
  ok('알림 시각: 마감 하루 전 오전 9시 · 정확한 알람 아님', at.getFullYear() === 2099 && at.getMonth() === 2 && at.getDate() === 9 && at.getHours() === 9 && at.getMinutes() === 0 && s[0].isExactNotification === false, String(at));
  ok('알림 글: 짧은 이름 없으면 제목 그대로 · 마감 시각', s[0].body.startsWith('[정정] 가 공고 — 내일 17:00 마감'), s[0].body);
  b.local.setItem('cheongyak-check-stars', '["a","c"]'); await tick(); await tick();
  ok('★ 바뀌면 다시 예약 (같은 공고는 같은 번호 · 두 번째부터 묻지 않음)', b.log.scheduled.length === 1 && b.log.cancelled.length === 1 && b.log.asked === 1);
  b.local.setItem('cheongyak-check-stars', '[]'); await tick(); await tick();
  ok('★ 모두 끄면 예약 없음', b.log.scheduled.length === 0); }
{ const b = boot({ ls: { 'cheongyak-check-v1': '{}', 'cheongyak-check-app-feed': '{"items":[{"id":"z"}]}' }, net: false }); await tick();
  const r = await b.win.fetch('feed/notices.json');
  ok('인터넷이 안 되면 기억해 둔 피드', (await r.json()).items[0].id === 'z');
  let threw = false; try { await b.win.fetch('feed/detail/x.json'); } catch (e) { threw = true; }
  ok('피드 말고 다른 주소는 그대로 (오프라인이면 실패)', threw); }
{ const b = boot({ ls: { 'cheongyak-check-v1': '{}' }, granted: false }); await tick(); await b.win.fetch('feed/notices.json'); b.local.setItem('cheongyak-check-stars', '["a"]'); await tick(); await tick();
  ok('알림을 허용 안 했으면 예약 안 함', b.log.scheduled.length === 0); }
// 4) 파일 받기 · 5) 뒤로 버튼
{ const b = boot({ ls: { 'cheongyak-check-v1': '{}' } }); await tick();
  const a = new b.A(); a.download = 'x.ics'; a.href = 'blob:abc'; b.win.fetch = b.win.fetch; a.click(); await tick();
  const p = new b.A(); p.download = ''; p.href = 'https://x'; p.click();
  ok('blob 파일 받기 → 앱 임시 폴더 + 공유 시트 · 보통 링크는 그대로', b.log.shared.length === 1 && b.log.shared[0].files[0] === 'file:///cache/x.ics' && b.log.plain === 1, JSON.stringify(b.log.shared));
  b.ctx.location.hash = '#notices'; b.listeners.backButton(); ok('뒤로 버튼: 공고 탭이면 앱 닫기', b.log.exit === 1);
  b.ctx.location.hash = '#diag'; b.listeners.backButton(); await new Promise(r => setTimeout(r, 350));
  ok('뒤로 버튼: 기록이 없으면 공고 탭으로', b.ctx.location.hash === '#notices' && b.log.exit === 1); }

// sync-web: 앱 화면에만 bridge
execFileSync(process.execPath, [join(REPO, 'app/sync-web.mjs')]);
const web = readFileSync(join(REPO, 'index.html'), 'utf8'), app = readFileSync(join(REPO, 'app/www/index.html'), 'utf8');
ok('sync-web: 앱 화면에만 app-bridge.js 한 번 · 웹 index.html 에는 없음', app.split('app-bridge.js').length === 2 && !web.includes('app-bridge') && existsSync(join(REPO, 'app/www/app-bridge.js')) && !existsSync(join(REPO, 'app/www/sw.js')));
ok('sync-web: 앱 화면은 웹과 같은 내용 (bridge 한 줄만 다름)', app.replace('\n<script src="app-bridge.js"></script>', '') === web);
const cfg = JSON.parse(readFileSync(join(REPO, 'app/capacitor.config.json'), 'utf8')), gradle = join(REPO, 'app/android/app/build.gradle');
ok('앱 ID: capacitor.config.json 한 곳 → Android applicationId', !existsSync(gradle) || readFileSync(gradle, 'utf8').includes(`applicationId "${cfg.appId}"`), cfg.appId);

for (const [s, n, g] of rows) console.log(s, n, g ? '→ ' + g : '');
const bad = rows.filter(r => r[0] === 'NG').length; console.log(bad ? `\n${bad}개 실패` : `\n${rows.length}개 모두 OK`); process.exit(bad ? 1 : 0);
