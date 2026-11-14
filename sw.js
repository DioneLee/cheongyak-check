// 청약 체크 서비스 워커
// - index.html · 공고 피드(feed/notices.json) · 단지(feed/danji.json) · 공고 상세(feed/detail/) · lib/: 늘 인터넷에서 먼저 받고, 실패할 때만 저장해 둔 것을 보여 준다
// - 아이콘 · 예시 공고 · manifest: 저장본 먼저 (없으면 받아서 저장)
// - 다른 주소(AI·지도·글꼴)는 건드리지 않는다
// 배포할 때 VERSION 을 바꾸면 새 저장소를 만들고 예전 것은 지운다 (scripts/verify/check.py 가 index.html·아이콘이 바뀌었는데 그대로면 알려 준다)
// 리다이렉트: Cloudflare Pages 는 /terms.html → /terms, /index.html → / 로 308 을 준다. 넘어간 응답(redirected)을 그대로 화면 요청에 넘기면
//   크롬이 거부한다(ERR_FAILED) → 받은 응답은 늘 clean() 으로 새 Response 로 감싸 넘기고 저장한다 (사전 저장 CORE 도)
const VERSION = 'cheongyak-check-2026-11-14a';
const CORE = ['./', 'index.html', 'terms.html', 'privacy.html', 'lib/feed-tools.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'samples/notice_yongsan.json', 'feed/notices.json', 'feed/danji.json'];

const clean = res => res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(async p => {
  const res = clean(await fetch(p, { cache: 'reload' })); if (!res.ok) throw new Error(`사전 저장 실패 ${p} ${res.status}`); await c.put(p, res);
}))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k.startsWith('cheongyak-check-') && k !== VERSION).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const fresh = r.mode === 'navigate' || /\/$|\.html$|\/feed\/(notices|danji)\.json$|\/feed\/detail\/|\/lib\//.test(u.pathname);   // 공고 상세 · 공용 코드(lib/)도 인터넷 먼저 (index.html 과 버전이 엇갈리지 않게)
  e.respondWith(fresh ? netFirst(r) : cacheFirst(r));
});

async function netFirst(r) {
  const c = await caches.open(VERSION), saved = () => c.match(r, { ignoreSearch: true }).then(x => x || (r.mode === 'navigate' ? c.match('./') : undefined));
  try {
    const res = clean(await (r.mode === 'navigate' ? fetch(r.url, { cache: 'no-store', redirect: 'follow', credentials: 'same-origin' }) : fetch(r, { cache: 'no-store' })));
    if (res.ok) { c.put(r, res.clone()); return res; }
    return (await saved()) || res;   // 서버 오류(5xx 등)도 저장본이 있으면 저장본
  } catch (err) {
    return (await saved()) || Response.error();
  }
}
async function cacheFirst(r) {
  const c = await caches.open(VERSION), hit = await c.match(r);
  if (hit) return hit;
  const res = clean(await fetch(r));
  if (res.ok) c.put(r, res.clone());
  return res;
}
