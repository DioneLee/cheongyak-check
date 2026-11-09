// 게시판·운영사 사이트를 조심해서 읽는 공통 도우미 (feed.mjs · danji.mjs · sources/*.mjs 가 같이 쓴다 → 같은 사이트 간격·robots 기록을 공유)
export const GAP_MS = Number(process.env.SCRAPE_GAP_MS ?? 3000);
const lastHit = {}, robots = {};
export async function polite(url, opt) {
  const h = new URL(url).host, w = (lastHit[h] || 0) + GAP_MS - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w));
  lastHit[h] = Date.now(); return fetch(url, opt);
}
// robots.txt 의 'User-agent: *' 묶음 Disallow 만 본다 (없거나 4xx 면 허용 — 표준과 같음 · 5xx·연결 실패면 이번엔 건너뜀)
export function robotsAllows(txt, path) {
  let star = false, inGroup = false; const dis = [];
  for (const raw of String(txt).split(/\r?\n/)) { const l = raw.replace(/#.*/, '').trim(), m = l.match(/^([\w-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!inGroup) star = false; inGroup = true; if (v === '*') star = true; continue; }
    inGroup = false; if (star && k === 'disallow' && v) dis.push(v); }
  return !dis.some(d => path.startsWith(d));
}
export async function robotsOk(url) {
  const u = new URL(url);
  if (!(u.host in robots)) { try { const r = await polite(`${u.origin}/robots.txt`, { headers: { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)' }, signal: AbortSignal.timeout(20000) });
    robots[u.host] = r.ok ? await r.text() : r.status < 500 ? '' : null; } catch { robots[u.host] = null; } }
  if (robots[u.host] === null) throw new Error(`${u.host}: robots.txt 를 확인하지 못해 이번엔 건너뜀`);
  if (!robotsAllows(robots[u.host], u.pathname)) throw new Error(`${u.host}: robots.txt 가 ${u.pathname} 를 막아 건너뜀`);
}
