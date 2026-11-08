// 공고 공개 정보 구조화 (Actions 에서만 · 사용자 정보 없음): feed.mjs 가 상세(addDetails) 뒤에 부른다
// items[] 에 붙이는 것 (notices.json):
//   ev: 일정 이벤트 [{ k: start|end|announce|docs|contract, l, d, e?, t? }] — 목록의 청약 기간(from/to/time) + 상세 일정 글
//   cr: 자격 기준 { c: [{ k: age|homeless|single|region|car|asset|income, … , cond? }], x: 판정에 안 넣은 줄 수 } | null
//   ty: 주택형 [{ n, a: 전용㎡, dep: 보증금 만원, rent: 월세 만원 }] (상세 supply 순서 그대로) | []
//   st: 가까운 역 { n: 역 이름, m: 직선거리 m, w: 도보 분(추정) } | null — 단지 주소 → 좌표(OSM Nominatim, feed/geo.json 에 저장) → feed/stations.json
// 그리고 feed/calendar.ics (서울 진행중 공고의 청약 시작·마감, 구독용)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const FT = createRequire(import.meta.url)('../lib/feed-tools.js');
const at = p => fileURLToPath(new URL(p, import.meta.url));
export const GEO_FILE = at('../feed/geo.json'), STATIONS_FILE = at('../feed/stations.json'), CAL_FILE = at('../feed/calendar.ics'), DETAIL_DIR = at('../feed/detail/');
const readJson = async (f, d) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return d; } };

// ---------- 날짜 글 → 날짜·시각 ----------
// '2026.11.09.(월) ~ 2026.11.10.(화) 00:00~23:00' · '2026. 11. 2. ~ 11. 12. 18시' · '11월 10일 ~ 11월 17일' · '2026.11.11.(수) 17:00 예정' · '오전 10시 ~ 오후 17시'
export function parseWhen(text, baseYear) {
  const s = String(text || ''), ds = [];
  let y = baseYear, pm = 0;
  for (const m of s.matchAll(/(?:(\d{4})\s*[.\-/년]\s*|[‘'’]\s*(\d{2})\s*\.\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일|\.)?(?![\d:])/g)) {
    const mo = +m[3], da = +m[4]; if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
    if (m[1]) y = +m[1]; else if (m[2]) y = 2000 + +m[2]; else if (pm && mo < pm) y++;
    if (!y) continue; pm = mo; ds.push(`${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`);
  }
  if (!ds.length) return null;
  const ts = [...s.matchAll(/(오전|오후)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시)/g)].map(m => { let h = +m[2]; if (m[1] === '오후' && h < 12) h += 12; return `${String(h).padStart(2, '0')}:${m[3] || '00'}`; }).filter(t => +t.slice(0, 2) <= 24);
  const d1 = ds[0], d2 = ds[ds.length - 1];
  let t1 = '', t2 = ''; if (ts.length >= 2) { t1 = ts[0]; t2 = ts[ts.length - 1]; } else if (ts.length === 1) { if (d2 !== d1) t2 = ts[0]; else t1 = ts[0]; }
  return { d1, d2: d2 < d1 ? d1 : d2, t1, t2 };
}
const kindOf = l => /발표/.test(l) ? 'announce' : /계약/.test(l) ? 'contract' : /(청약|접수|신청)/.test(l) && !/공개|열람|사전/.test(l) ? 'apply' : /제출/.test(l) ? 'docs' : null;
// 목록의 청약 기간(from/to/time — 청년안심주택 본문·마이홈 API)이 있으면 그걸 먼저, 상세 일정 글은 그 밖의 일정에
export function eventsFor(item, detail) {
  const ev = [], year = +(item.posted || item.from || item.to || '').slice(0, 4) || new Date().getFullYear();
  const fromItem = !!item.to && !item.startOnly;
  if (fromItem) { if (item.from && item.from !== item.to) ev.push({ k: 'start', l: '청약 시작', d: item.from }); ev.push({ k: 'end', l: '청약 마감', d: item.to, ...(item.time ? { t: item.time } : {}) }); }
  else if (item.startOnly && item.to) ev.push({ k: 'start', l: '청약 시작', d: item.to });
  for (const r of detail?.schedule || []) {
    const k = kindOf(r.label || ''), w = parseWhen(r.date, year); if (!k || !w) continue;
    if (k === 'apply') { if (fromItem || ev.some(e => e.k === 'end')) continue;
      if (w.d1 !== w.d2 || w.t1) ev.push({ k: 'start', l: r.label, d: w.d1, ...(w.t1 && w.d1 !== w.d2 ? { t: w.t1 } : {}) });
      ev.push({ k: 'end', l: r.label, d: w.d2, ...(w.t2 || (w.d1 === w.d2 && w.t1) ? { t: w.t2 || w.t1 } : {}) }); continue; }
    ev.push({ k, l: r.label, d: w.d1, ...(w.d2 !== w.d1 ? { e: w.d2 } : w.t1 ? { t: w.t1 } : {}) });
  }
  return ev.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.d)).slice(0, 12);
}

// ---------- 돈 글 → 만원 ----------
export function man(str) {
  const s = String(str || '').replace(/\s/g, '');
  let m = s.match(/^([\d,.]+)백만원?/); if (m) return Math.round(+m[1].replace(/,/g, '') * 100);
  let t = 0, hit = false;
  if ((m = s.match(/(\d+)억/))) { t += +m[1] * 1e4; hit = true; }
  if ((m = s.match(/(?:억)?(\d+)천/))) { t += +m[1] * 1e3; hit = true; }
  if ((m = s.match(/(?:천)?(\d+)백(?!만원?$)/)) || (m = s.match(/(\d+)백만/))) { t += +m[1] * 100; hit = true; }
  if ((m = s.match(/(?:억|천|백)?([\d,.]+)만/)) && !/백만/.test(s)) { const v = +m[1].replace(/,/g, ''); if (/억/.test(s) && v >= 1e4) return null; t += v; hit = true; }   // '2억5,1000만' 같은 잘못 옮긴 글은 읽지 않음
  if (!hit && (m = s.match(/([\d,]{5,})원/))) return Math.round(+m[1].replace(/,/g, '') / 1e4 * 100) / 100;
  return hit ? t : null;
}
const MONEY = /(?:\d+\s*억\s*)?(?:\d+\s*천\s*)?(?:\d+\s*백\s*)?(?:[\d,.]+\s*)?(?:백만|만)\s*원?|[\d,]{5,}\s*원/g;
const firstMoney = s => { for (const m of String(s || '').matchAll(MONEY)) { const v = man(m[0]); if (v != null && v > 0) return v; } return null; };

// ---------- 주택형 → 면적·보증금·월세 ----------
export function typesOf(detail) {
  return (detail?.supply || []).map(r => {
    const a = +(String(r.area || '').match(/(\d+(?:\.\d+)?)\s*(?:㎡|m2|m²)?/)?.[1]); const p = String(r.price || '');
    const dep = firstMoney(p.match(/(?:보증금|전세금)[^/·]*?(?=\/|·|월|$)/)?.[0] || ''), rent = firstMoney(p.match(/(?:월\s*임대료|월세|임대료|월\s)[^/·(]*/)?.[0] || '');
    return { n: r.type || '', a: a > 5 && a < 300 ? a : null, dep, rent };
  });
}

// ---------- 자격 글 → 기준 ----------
const COND = /만\s*해당|대상자만|인\s*경우|경우에\s*한|순위|특별공급|일반공급/;
export function critsOf(detail) {
  if (!detail || detail.source === 'api') return null;
  const lines = [...(detail.eligibility || []), detail.target].filter(Boolean), all = [...lines, detail.income, detail.asset, detail.car].filter(Boolean).join('\n'), c = [], used = new Set();
  // 나이 (자녀 나이 줄은 빼고)
  for (const l of lines) { if (/자녀/.test(l)) continue;
    const m = l.match(/만\s*(\d{1,2})\s*세\s*(?:이상)?\s*(?:[~∼\-]|부터)?\s*(?:만\s*)?(\d{1,2})\s*세\s*(?:이하|까지)/) || l.match(/만\s*(\d{1,2})\s*[~∼]\s*(\d{1,2})\s*세/);
    if (m) { c.push({ k: 'age', min: +m[1], max: +m[2] }); used.add(l); break; }
    const n = l.match(/만\s*(\d{1,2})\s*세\s*이상/); if (n) { c.push({ k: 'age', min: +n[1], max: null }); used.add(l); break; } }
  const hl = lines.find(l => /무주택/.test(l)); if (hl) { c.push({ k: 'homeless', scope: /세대\s*(원|구성원)|세대원|세대\s*전원/.test(hl) ? '세대' : '본인' }); used.add(hl); }
  const sl = lines.find(l => /미혼|혼인\s*중이\s*아닌/.test(l)); if (sl && !/신혼/.test(lines.join(' '))) { c.push({ k: 'single' }); used.add(sl); }
  const rl = lines.filter(l => /서울(?:특별)?시?\s*(?:에\s*)?(?:거주|주민등록)|서울시민/.test(l)); if (rl.length) { const tx = rl.join(' ') + ' ' + lines.join(' ');
    c.push({ k: 'region', work: /학교|직장|재학|재직|학업|취업/.test(tx), ...(/예비서울시민|외\s*거주\s*시/.test(lines.join(' ')) ? { cond: true } : {}) }); rl.forEach(l => used.add(l)); }
  const carTx = [detail.car, ...lines.filter(l => /자동차/.test(l))].filter(Boolean).join(' '); if (carTx) { const v = firstMoney(carTx);
    if (v) c.push({ k: 'car', max: v, ...(COND.test(carTx) ? { cond: true } : {}) }); lines.filter(l => /자동차/.test(l)).forEach(l => used.add(l)); }
  const asTx = [detail.asset, ...lines.filter(l => /자산/.test(l))].filter(Boolean).join(' '); if (asTx) {
    const by = {}; for (const seg of asTx.split(/,\s+|[/·;]|\s(?=신혼|청년|\(예비\))/)) { const v = firstMoney(seg); if (!v) continue; if (/청년/.test(seg)) by.youth ??= v; else if (/신혼/.test(seg)) by.newlywed ??= v; else by.all ??= v; }
    if (Object.keys(by).length) c.push({ k: 'asset', ...(by.youth || by.newlywed ? { by } : { max: by.all }), ...(COND.test(asTx) ? { cond: true } : {}) }); lines.filter(l => /자산/.test(l)).forEach(l => used.add(l)); }
  const inTx = [detail.income, ...lines.filter(l => /소득/.test(l))].filter(Boolean).join(' '); if (inTx && /소득/.test(inTx) && !/소득\s*(?:기준|요건)\s*없음/.test(inTx.replace(/특별공급[^/]*/, ''))) {
    const pcts = [...inTx.matchAll(/(\d{2,3})\s*%/g)].map(m => +m[1]).filter(p => p >= 30 && p <= 200), amt = {};
    for (const m of inTx.matchAll(/(\d)\s*인\s*(?:가구)?[^\d,]{0,14}?([\d,]{7,})\s*원/g)) { const v = Math.round(+m[2].replace(/,/g, '') / 1e4); amt[m[1]] = Math.max(amt[m[1]] || 0, v); }
    c.push({ k: 'income', pct: pcts.length ? Math.max(...pcts) : null, ...(Object.keys(amt).length ? { amt } : {}), ...(COND.test(inTx) || /없음/.test(inTx) ? { cond: true } : {}) }); lines.filter(l => /소득/.test(l)).forEach(l => used.add(l)); }
  for (const l of lines) if (/세\s*(이상|이하)/.test(l) && !/자녀/.test(l)) used.add(l);
  const x = (detail.eligibility || []).filter(l => !used.has(l)).length;
  return c.length ? { c, x } : null;
}

// ---------- 제목·본문의 역 이름과 거리 문구 ----------
// '건대입구역 6번 출구' · '숭곡초교역(예정)' · '역에서 도보 5분' · '직선거리 350m' → { n, pre?, exit?, w?, m? } (서울 지하철역 목록에 있거나 '(예정)'인 이름만)
let STN = null; const stationsOf = () => (STN ??= (() => { try { return JSON.parse(readFileSync(STATIONS_FILE, 'utf8')).stations || {}; } catch { return {}; } })());
export function nearFrom(title, text, stations = stationsOf()) {
  const lines = String(text || '').split('\n').filter(l => /역/.test(l)), info = lines.filter(l => /출구|도보|거리/.test(l));
  const src = [...info, String(title || ''), ...lines.filter(l => !info.includes(l))];   // 출구·도보·거리가 적힌 본문 줄 → 제목 → 나머지 본문
  const found = [];
  for (const line of src) for (const m of line.matchAll(/([가-힣A-Za-z0-9]{1,12}역)\s*(\(\s*예정\s*\))?/g)) {
    const n = m[1], pre = !!m[2]; if ((!pre && !stations[n]) || found.some(f => f.n === n)) continue;
    const r = { n, ...(pre ? { pre: true } : {}) }, ex = line.match(/(\d{1,2})\s*번\s*출구/), w = line.match(/도보\s*(?:약\s*)?(\d{1,2})\s*분/), d = line.match(/(?:직선\s*)?거리\s*(?:약\s*)?([\d,.]+)\s*(km|m)\b/i);
    if (ex) r.exit = ex[1]; if (w) r.w = +w[1]; if (d) r.m = Math.round(+d[1].replace(/,/g, '') * (/km/i.test(d[2]) ? 1000 : 1));
    found.push(r);
  }
  if (!found.length) return null;
  const main = found.find(f => !f.pre) || found[0], alt = found.find(f => f.pre && f !== main);   // 운행 중인 역이 먼저 · 개통 예정 역은 덧붙임
  return { ...main, ...(alt ? { alt: alt.n } : {}) };
}

// ---------- 주소 → 좌표 → 가까운 역 ----------
export const addrFrom = text => { const l = String(text || '').split('\n').map(x => x.match(/(?:주택\s*위치|소재지|위\s*치|주\s*소)\s*[:：]\s*(.+)/)?.[1]).find(Boolean); if (!l) return null;
  const a = l.replace(/\(.*?\)/g, '').replace(/\s+외\s*\d+\s*필지.*/, '').trim(); return /서울/.test(a) && a.length >= 8 ? a.slice(0, 80) : null; };
const R = 6371000, rad = x => x * Math.PI / 180;
export const meters = (a, b) => { const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]), h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); };
export function nearest(pt, stations) { let best = null; for (const [n, p] of Object.entries(stations)) { const m = meters(pt, p); if (!best || m < best.m) best = { n, m }; } return best && { ...best, w: Math.max(1, Math.round(best.m / 67 * 1.3)) }; }   // 도보 분 ≈ 직선거리 ÷ 67m/분 × 1.3 (약)
const UA = { 'User-Agent': 'cheongyak-check (https://github.com/DioneLee/cheongyak-check)' };
// OSM Nominatim · 1초에 1번 · 번지(건물)까지 찾은 결과만 씀 — 도로·동 수준만 찾으면 '정보 없음' (2026-11-08: 한국 주소 7개 중 1개만 번지까지 찾음) · 실패는 7일 뒤 다시
export async function geocode(addr, cache, { fetchFn = fetch, now = Date.now() } = {}) {
  const c = cache[addr]; if (c?.ll) return c.ll; if (c?.fail && now - Date.parse(c.fail) < 7 * 864e5) return null;
  let why = '못 찾음';
  await new Promise(r => setTimeout(r, Number(process.env.GEO_GAP_MS ?? 1100)));
  try { const r = await fetchFn(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: addr, format: 'json', limit: '1', countrycodes: 'kr', addressdetails: '1' })}`, { headers: UA, signal: AbortSignal.timeout(20000) });
    const j = r.ok ? await r.json() : [], x = j[0];
    if (x && (x.address?.house_number || x.class === 'building' || ['building', 'house'].includes(x.addresstype))) { cache[addr] = { ll: [Math.round(+x.lat * 1e5) / 1e5, Math.round(+x.lon * 1e5) / 1e5] }; return cache[addr].ll; }
    if (x) why = `${x.addresstype || x.type || x.class} 수준만 찾음`; } catch { why = '연결 실패'; }
  cache[addr] = { fail: new Date(now).toISOString().slice(0, 10), why }; return null;
}

// ---------- 모두 붙이기 + 구독 캘린더 ----------
export async function enrich(items, { dir = DETAIL_DIR, geoFile = GEO_FILE, stationsFile = STATIONS_FILE, fetchFn = fetch, log = console.log } = {}) {
  const geo = await readJson(geoFile, {}), stations = (await readJson(stationsFile, {})).stations || {};
  let geoNew = 0, geoFail = 0;
  const seqFile = `${dir}_seq.json`, seqAll = await readJson(seqFile, {});
  for (const it of items) {
    const f = `${dir}${it.id}.json`, d = it.detail ? await readJson(f, null) : null;
    it.ev = eventsFor(it, d); it.cr = critsOf(d); it.ty = typesOf(d); it.lm = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(d?.readAt || '') ? d.readAt : '';
    // 역: 본문에 거리가 있으면 그 값 → 없으면 번지까지 찾은 좌표의 직선거리(본문 역이 있으면 그 역까지) → 그것도 없으면 역 이름만
    const near = d?.near || nearFrom(it.title, ''), addr = d?.addr || null; let ll = null;
    if (addr && Object.keys(stations).length) { const had = !!geo[addr]; ll = await geocode(addr, geo, { fetchFn }); if (!had) ll ? geoNew++ : geoFail++; }
    const tag = near ? { ...(near.pre ? { pre: true } : {}), ...(near.exit ? { exit: near.exit } : {}), ...(near.alt ? { alt: near.alt } : {}) } : {};
    if (near && (near.w || near.m)) it.st = { n: near.n, m: near.m ?? null, w: near.w ?? Math.max(1, Math.round(near.m / 67 * 1.3)), src: 'text', ...tag };
    else if (ll) { const to = near && stations[near.n] ? { n: near.n, m: meters(ll, stations[near.n]) } : nearest(ll, stations); it.st = { n: to.n, m: to.m, w: Math.max(1, Math.round(to.m / 67 * 1.3)), src: 'geo', ...(near?.n === to.n ? tag : {}) }; }
    else it.st = near ? { n: near.n, m: null, w: null, src: 'name', ...tag } : null;
    // SEQUENCE: 일정(종류별 번호)마다 날짜·시각이 바뀌면 +1 — 상세 파일 seq 에(없으면 _seq.json)
    const box = d ? (d.seq ??= {}) : (seqAll[it.id] ??= {}), cnt = {}; let changed = false;
    for (const e of it.ev) { const i = cnt[e.k] = (cnt[e.k] ?? -1) + 1, key = `${e.k}${i ? `-${i}` : ''}`, sig = `${e.d}|${e.e || ''}|${e.t || ''}`, p = box[key];
      if (!p) { box[key] = { n: 0, s: sig }; changed = true; } else if (p.s !== sig) { box[key] = { n: p.n + 1, s: sig }; changed = true; }
      if (box[key].n) e.q = box[key].n; }
    if (d && changed) { await writeFile(f, JSON.stringify(d, null, 1) + '\n', 'utf8'); it.dv = createHash('sha1').update(await readFile(f)).digest('hex').slice(0, 10); }   // 상세가 바뀌었으니 dv 도 다시
  }
  for (const id of Object.keys(seqAll)) if (!items.some(i => i.id === id)) delete seqAll[id];
  await writeFile(seqFile, JSON.stringify(seqAll, null, 1) + '\n', 'utf8');
  await writeFile(geoFile, JSON.stringify(geo, null, 1) + '\n', 'utf8');
  log(`꾸미기 · 일정 ${items.filter(i => i.ev.length).length}건 · 자격 기준 ${items.filter(i => i.cr).length}건 · 주택형 ${items.filter(i => i.ty.length).length}건 · 역 ${items.filter(i => i.st).length}건 (본문 거리 ${items.filter(i => i.st?.src === 'text').length} · 좌표 직선거리 ${items.filter(i => i.st?.src === 'geo').length} · 역 이름만 ${items.filter(i => i.st?.src === 'name').length}) · 새 좌표 ${geoNew} · 좌표 실패 ${geoFail}`);
  return items;
}
export async function writeCalendar(items, file = CAL_FILE, now = new Date()) {   // 구독용: 청약 시작·마감만 · DTSTAMP = 파일을 만든 시각(UTC) · DTSTAMP 말고 바뀐 게 없으면 다시 쓰지 않음
  const body = FT.ics(items.map(i => ({ id: i.id, lm: i.lm, name: i.title.replace(/^\s*(\[[^\]]*\]\s*)+/, '').replace(/\s*(입주자\s*)?(최초|추가|예비|잔여)?\s*(입주자\s*)?모집\s*공고문?.*$/, '').trim() || i.title, url: i.url, ev: i.ev })),
    { calName: '청약 체크 · 서울 진행중 공고', kinds: ['start', 'end'], refresh: 'PT3H', dtstamp: () => now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '') });
  let prev = ''; try { prev = await readFile(file, 'utf8'); } catch { /* 처음 */ }
  const strip = x => x.replace(/^DTSTAMP:.*$/gm, '');
  if (strip(prev) === strip(body)) return false; await writeFile(file, body, 'utf8'); return true;
}
