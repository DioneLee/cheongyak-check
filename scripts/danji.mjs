// 서울 청년안심주택 단지 정보 → feed/danji.json (+ 게시판 공고 이력 feed/danji_bbs.json) · 하루 1번 (feed.mjs 가 부름)
//   처음 한 번: node scripts/danji.mjs --seed samples/danji_seoul_101.csv   (사용자가 정리한 표 + 단지 목록 요청 1번)
// 받는 것은 공개된 단지 기본정보와 공고 제목·날짜뿐 — 본문·첨부·사진은 저장하지 않는다
//  · 단지 목록 yoHomeListJson.json (요청 1번에 101개): 구 · 이름 · 역·도보 · 보증금/월세 범위
//  · 단지 상세 view.do: 시행사 · 홈페이지 · 대표전화 · 건물 좌표(화면 지도의 xpos·ypos) — 새 단지·좌표 아직 없는 단지는 바로, 나머지는 7일마다 (101번 × 3초)
//  · 모집공고 게시판 bbsListJson.json: 제목·게시일만 → 단지마다 공고 수 · 추가모집 수 · 최근 추가모집 · 최초 공고 (처음엔 전부, 다음부터 새 글만)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { polite, robotsOk } from './net.mjs';
import { httpUrl } from './url.mjs';
import { OTHERS } from './sources/elyes.mjs';

export const DANJI_OUT = fileURLToPath(new URL('../feed/danji.json', import.meta.url));
export const BBS_OUT = fileURLToPath(new URL('../feed/danji_bbs.json', import.meta.url));
const Y = 'https://soco.seoul.go.kr/youth', UA = { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)' };
const LIST = `${Y}/pgm/home/yohome/yoHomeListJson.json`, BBS = `${Y}/pgm/home/yohome/bbsListJson.json`, VIEW = c => `${Y}/pgm/home/yohome/view.do?menuNo=400002&homeCode=${encodeURIComponent(c)}`;
const VIEW_DAYS = 7, todayKst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const unHtml = s => String(s ?? '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

// '2억1천5백50만' → 21550 (만원) · '4천8백0만' → 4800 · '16만' → 16 · 숫자 아님 → null
export function money(s) {
  const t = String(s ?? '').replace(/\s|원/g, ''); if (!/만$/.test(t) || !/\d/.test(t)) return null;
  const n = re => +(t.match(re)?.[1] ?? 0);
  return n(/(\d+)억/) * 10000 + n(/(\d+)천/) * 1000 + n(/(\d+)백/) * 100 + n(/(\d+)만$/);
}
// '6호선 화랑대역 6번출구 146m, 도보 2분' → { line: '6호선', station: '화랑대역', walk: 2, m: 146 } · 역 이름이 없으면 단지 이름 앞 'OO역' (parseList)
export function subway(s) {
  const t = String(s ?? '').trim(), st = t.match(/(\S+?역)(?:\(예정\))?(?=\s|$|,)/)?.[1] || '';
  const line = ((st ? t.split(st)[0] : t.split(/\d+번\s*출구/)[0]) || '').match(/[\w가-힣-]+선/g)?.join(', ') || '', w = t.match(/도보\s*(\d+)\s*분/), m = t.match(/(\d[\d,]*)\s*m(?![a-z])/);
  return { line, station: st, walk: w ? +w[1] : null, m: m ? +m[1].replace(/,/g, '') : null };
}
export function parseList(data) {
  // 목록에 단지가 아닌 글('2026년 2차 공공임대 모집공고' — 구·역 없음)이 섞여 있어 뺀다
  return (data?.resultList ?? []).filter(r => r?.homeCode && r.homeName && !/모집\s*공고/.test(r.homeName)).map(r => {
    const s = subway(r.optionSubway); if (!s.station) s.station = String(r.homeName).match(/^(\S+역)(?:\(예정\))?\s/)?.[1] || '';
    const lo = r.moneyDepositLow > 0 ? Math.round(r.moneyDepositLow / 10000) : money(r.fnMoneyDepositLow);
    const rlo = r.moneyRentalLow > 0 ? Math.round(r.moneyRentalLow / 10000) : money(r.fnMoneyRentalLow);
    return { id: String(r.homeCode), gu: String(r.adresGu || ''), name: unHtml(r.homeName).trim(), ...s, sub: String(r.optionSubway || '').slice(0, 80),
      dep: [lo, money(r.fnMoneyDepositHigh) ?? lo], rent: [rlo, money(r.fnMoneyRentalHigh) ?? rlo] };
  });
}
// 서울 안 좌표만 (위도 37.41~37.72 · 경도 126.76~127.19) → [위도, 경도] 소수 5자리 · 아니면 null
export const seoulLl = (lat, lng) => { const a = +lat, o = +lng; return a >= 37.41 && a <= 37.72 && o >= 126.76 && o <= 127.19 ? [Math.round(a * 1e5) / 1e5, Math.round(o * 1e5) / 1e5] : null; };
// 단지 상세 화면에서 세 줄 + 건물 좌표만 (나머지는 버림) · 좌표는 서울시가 단지 지도에 찍는 값 (위치 검색 아님, 2026-11-14)
export function parseView(html) {
  const pos = k => String(html).match({ x: /var\s+xpos\s*=\s*["']([\d.]+)["']/, y: /var\s+ypos\s*=\s*["']([\d.]+)["']/ }[k])?.[1], ll = seoulLl(pos('y'), pos('x'));
  const txt = unHtml(String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')).split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  const after = k => txt.match(new RegExp(`${k}\\s*:\\s*\\n?([^\\n]+)`))?.[1].trim() || '';
  const home = after('홈페이지'), tel = after('대표전화').match(/[\d-]{7,}/)?.[0] || '';
  return { dev: after('시행사').slice(0, 60), home: home.length <= 200 ? httpUrl(home) : '', tel, ll };
}
export const parseBbs = data => (data?.resultList ?? []).filter(r => r?.boardId && r.nttSj).map(r => ({ id: String(r.boardId), t: unHtml(r.nttSj).trim().slice(0, 160), d: String(r.optn1 || '').slice(0, 10) }));

// 공고 제목 → 단지 id (단지 이름이 제목에 들어 있으면 · 앞의 'OO역 ' 을 뺀 이름도 봄 · 가장 긴 이름이 이김)
const nk = s => String(s).replace(/[\s[\]()（）·.,\-_'"‘’“”<>]/g, '').toLowerCase();
export function matchDanji(title, list) {
  const t = nk(title); let best = null, len = 0;
  for (const d of list) for (const k of [nk(d.name), nk(d.name.replace(/^\S+역(\(예정\))?\s+/, ''))]) if (k.length >= 4 && t.includes(k) && k.length > len) { best = d; len = k.length; }
  return best;
}
// 이력 → 단지마다 공고 수 · 추가모집 수 · 최근 추가모집 · 최초 공고일
export function countHistory(list, hist) {
  const by = new Map(list.map(d => [d.id, { bbs: 0, extra: 0, lastExtra: '', first: '' }]));
  for (const h of hist) { const d = matchDanji(h.t, list); if (!d) continue; const c = by.get(d.id);
    c.bbs++; if (/추가\s*모집/.test(h.t)) { c.extra++; if (h.d > c.lastExtra) c.lastExtra = h.d; } if (h.d && (!c.first || h.d < c.first)) c.first = h.d; }
  return by;
}
// 자체 사이트에서만 공고: 최초 공고 뒤 1년이 지났는데 서울시 게시판 추가모집이 0건 (사이트도 같은 규칙 · check 가 둘을 맞춰 봄)
export const selfOnly = (d, today = todayKst()) => !!d.first && d.extra === 0 && Date.parse(today) - Date.parse(d.first) > 365 * 864e5;

async function post(url, body) {
  await robotsOk(url);
  const r = await polite(url, { method: 'POST', body: new URLSearchParams(body), headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`서울시 단지: HTTP ${r.status}`); return r.json();
}
export async function fetchList() {
  const data = await post(LIST, { pageNum: '1', rowCount: '300', searchPresale: '', searchTheme: '', searchMovinHoman: '', searchHouseType: '', searchHouseForm: '', searchAdresGu: '', searchSil: '', searchWrd: '' });
  const list = parseList(data); if (list.length < 50) throw new Error(`서울시 단지: 목록이 ${list.length}개뿐 (모양이 바뀜?)`); return list;
}
// 새 글만 (아는 글이 나오면 멈춤) · 처음이면 끝 쪽까지
export async function fetchBbs(known = new Set(), { maxPages = 80 } = {}) {
  const out = []; let complete = false;
  for (let p = 1; p <= maxPages; p++) {
    const data = await post(BBS, { bbsId: 'BMSR00015', pageIndex: String(p) }), rows = parseBbs(data);
    const fresh = rows.filter(r => !known.has(r.id)); out.push(...fresh);
    if (p >= Number(data.pagingInfo?.totPage ?? 1)) { complete = true; break; }
    if (fresh.length < rows.length) break;   // 여기부터는 이미 앎
  }
  return { rows: out, complete };
}
export async function fetchView(code) {
  const url = VIEW(code); await robotsOk(url);
  const r = await polite(url, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`서울시 단지 상세: HTTP ${r.status}`);
  return parseView(await r.text());
}

// 이전 danji.json + 새로 받은 것 → 새 danji.json. openIds: 지금 접수 중인 공고가 있는 단지 id
export function buildDanji(prev, { list, views = {}, hist = null, openIds = new Set(), today = todayKst() }) {
  const old = new Map((prev?.danji ?? []).map(d => [d.id, d])), counts = hist ? countHistory(list, hist) : null;
  const danji = list.map(b => {
    const o = old.get(b.id) || {}, v = views[b.id], c = counts?.get(b.id);
    // 공급상태: 접수 중 공고가 있으면 '청약중', 아니면 표(CSV) 값 base (지시서 확인 2026-11-09)
    const base = o.base ?? o.status ?? '', status = openIds.has(b.id) ? '청약중' : base;
    // 구: 사용자 표가 서울시 값과 다르면 표 값 (guFix · 2026-11-09 사용자 결정)
    return { ...b, ...(o.guFix ? { gu: o.guFix, guFix: o.guFix } : {}), dev: v?.dev ?? o.dev ?? '', home: httpUrl(v?.home ?? o.home), tel: v?.tel ?? o.tel ?? '', ll: v ? v.ll : o.ll, viewAt: v ? today : o.viewAt || '',
      base, status, first: c?.first || o.first || '', bbs: c ? c.bbs : o.bbs ?? 0, extra: c ? c.extra : o.extra ?? 0, lastExtra: c ? c.lastExtra : o.lastExtra || '' };
  }).sort((a, b) => a.gu.localeCompare(b.gu, 'ko') || a.name.localeCompare(b.name, 'ko'));
  return { updated: today, source: '서울시 청년안심주택 단지 정보 · 모집공고 게시판 (soco.seoul.go.kr)', danji, other: OTHERS };
}

// 하루 1번: 오늘 이미 했으면 그대로. 실패하면 이전 것 그대로 (피드는 계속)
export async function refreshDanji({ openIds = new Set(), force = false } = {}) {
  let prev = null, bbs = { items: [], complete: false }; try { prev = JSON.parse(await readFile(DANJI_OUT, 'utf8')); } catch { /* 처음 */ }
  try { bbs = JSON.parse(await readFile(BBS_OUT, 'utf8')); } catch { /* 처음 */ }
  const today = todayKst(); if (!force && prev?.updated === today) return { prev, wrote: false, note: '오늘 이미 갱신' };
  const list = await fetchList(), old = new Map((prev?.danji ?? []).map(d => [d.id, d])), views = {}, stale = todayKst(-VIEW_DAYS);
  let viewN = 0, viewBad = 0;
  for (const b of list) { const o = old.get(b.id); if (o?.viewAt && o.viewAt > stale && o.ll !== undefined) continue;   // 좌표 칸이 아직 없으면(2026-11-14 전 데이터) 한 번 더
    try { views[b.id] = await fetchView(b.id); viewN++; } catch { viewBad++; } }
  let hist = null;
  try { const got = await fetchBbs(new Set(bbs.items.map(i => i.id)), { maxPages: bbs.complete ? 10 : 80 });
    bbs = { items: [...got.rows, ...bbs.items].sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id)), complete: bbs.complete || got.complete };
    if (bbs.complete) hist = bbs.items; } catch (e) { console.error('단지 · 게시판 이력 실패:', e.message); }
  const next = buildDanji(prev, { list, views, hist, openIds, today });
  await writeFile(DANJI_OUT, JSON.stringify(next, null, 1) + '\n', 'utf8'); await writeFile(BBS_OUT, JSON.stringify(bbs) + '\n', 'utf8');
  return { prev: next, wrote: true, note: `단지 ${next.danji.length}개 · 상세 ${viewN}곳 새로 읽음${viewBad ? ` (실패 ${viewBad})` : ''} · 게시판 이력 ${bbs.items.length}건${bbs.complete ? '' : ' (아직 다 못 읽음)'}` };
}

// 첫 데이터: 사용자가 정리한 표(CSV) + 단지 목록 요청 1번 (역·보증금). 상세·게시판은 다음 정기 실행에서
export function parseCsv(text) {
  const rows = String(text).replace(/^﻿/, '').trim().split(/\r?\n/).map(l => [...l.matchAll(/"((?:[^"]|"")*)"|([^,]+)|(?<=,|^)(?=,|$)/g)].map(m => (m[1] ?? m[2] ?? '').replace(/""/g, '"')));
  const head = rows.shift(); return rows.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
export function seed(csvRows, list, today = todayKst()) {
  const byName = new Map(csvRows.map(r => [nk(r['단지']), r])), miss = [];
  const prev = { danji: list.map(b => { const r = byName.get(nk(b.name)); if (!r) { miss.push(b.name); return { id: b.id }; }
    return { id: b.id, ...(r['구'] && r['구'] !== b.gu ? { guFix: r['구'] } : {}), dev: r['시행사'], home: httpUrl(r['홈페이지']) || '', tel: r['대표전화'], status: r['공급상태'], base: r['공급상태'], viewAt: today,
      first: r['최초공고'], bbs: +r['서울시게시판 공고수'] || 0, extra: +r['추가모집 수'] || 0, lastExtra: r['최근 추가모집'] || '' }; }) };
  const out = buildDanji(prev, { list, today }); return { out, miss };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--seed');
  if (i > 0) {
    const rows = parseCsv(await readFile(process.argv[i + 1], 'utf8')), { out, miss } = seed(rows, await fetchList());
    await writeFile(DANJI_OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
    console.log(`첫 danji.json: 단지 ${out.danji.length}개 (표 ${rows.length}줄)${miss.length ? ` · 표에 없는 단지 ${miss.length}개: ${miss.join(', ')}` : ''} · 그 밖의 서울 민간임대 ${out.other.length}곳`);
  } else console.log((await refreshDanji({ force: process.argv.includes('--force') })).note);
}
