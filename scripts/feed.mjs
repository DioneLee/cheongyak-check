// 공고 피드 만들기: 마이홈포털·LH 공식 API(공공데이터포털) → feed/notices.json
// GitHub Actions(.github/workflows/feed.yml)가 돌린다. 인증키는 저장소 Secrets 의 DATA_GO_KR_KEY — URL·로그·파일 어디에도 남기지 않는다.
// 서울 공고만 (API 요청도 서울 코드 11 · 합친 뒤 지역이 '서울'로 시작하는 것만). SH·서울 청년안심주택은 게시판에서 가져오지 않는다 (사이트에는 원문 링크만).
// 출처 코드: jev-harness src/sources/{datagokr,myhome,lh}.js · src/feed.js 를 패키지 없이 옮김 (Node 20+)
// 사용: DATA_GO_KR_KEY=... node scripts/feed.mjs      검사: node scripts/verify/feed_check.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const FEED_OUT = fileURLToPath(new URL('../feed/notices.json', import.meta.url));
const SOURCE_LABEL = '마이홈포털·LH 공식 API';
const MYHOME = 'https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList';
const LH = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
const LH_TYPES = ['06', '13', '39'];   // 임대주택 · 주거복지 · 신혼희망타운
const NO_PERIOD_DAYS = 21;             // 마감일이 없는 공고는 게시 후 이 일수까지만

export function dataKey() {
  let k = (process.env.DATA_GO_KR_KEY || '').trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) { try { k = decodeURIComponent(k); } catch { /* 그대로 */ } }   // Encoding 키도 Decoding 키도 받는다
  return k;
}
export function scrub(msg) {
  let s = String(msg ?? '');
  const raw = (process.env.DATA_GO_KR_KEY || '').trim(), dec = dataKey();
  for (const k of [raw, dec, dec && encodeURIComponent(dec)]) if (k && k.length >= 8) s = s.split(k).join('***');
  return s.replace(/(service[_]?key=)[^&\s]+/gi, '$1***');
}
export async function getJson(label, base, params) {
  const key = dataKey(); if (!key) throw new Error(`${label}: DATA_GO_KR_KEY 없음`);
  let res;
  try { res = await fetch(`${base}?${new URLSearchParams({ serviceKey: key, ...params })}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); }
  catch (e) { throw new Error(`${label}: 연결 실패 (${scrub(e?.cause?.code || e?.name || 'network')})`); }
  const text = await res.text();
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`${label}: ${scrub(text.match(/<returnAuthMsg>([^<]+)</)?.[1] || text.match(/<resultMsg>([^<]+)</)?.[1] || 'JSON 아님')}`); }   // 게이트웨이 오류는 XML
}
export const ymd = v => { const m = String(v ?? '').match(/(\d{4})\D?(\d{2})\D?(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
export const todayKst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const ym = off => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7).replace('-', ''); };
const cityOf = s => String(s || '서울').replace(/특별시|광역시|특별자치시|특별자치도/, '');
export function orgOf(name = '') {
  if (/LH|한국토지주택/.test(name)) return 'LH';
  if (/SH|서울주택도시/.test(name)) return 'SH';
  if (/GH|경기주택도시/.test(name)) return 'GH';
  if (/한국자산관리공사|캠코/.test(name)) return '캠코';
  return (name || '기타').replace(/\s+/g, '').slice(0, 12);
}

// 마이홈포털 공공주택 모집공고 (data.go.kr 15108420): 한 줄 = 공고 × 단지 → pblancId 로 묶음. brtcCode 11 = 서울, 최근 3개월
export async function fetchMyHome({ brtcCode = '11', months = 3 } = {}) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const data = await getJson('마이홈 API', MYHOME, { brtcCode, numOfRows: '100', pageNo: String(page), yearMtBegin: ym(-(months - 1)), yearMtEnd: ym(0) });
    const head = data?.header ?? data?.response?.header, code = head?.resultCode;
    if (code && code !== '00' && code !== '03') throw new Error(`마이홈 API: ${head?.resultMsg ?? code}`);
    const body = data?.response?.body ?? data?.body ?? {}, raw = body.item ?? body.items?.item ?? body.items ?? [];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    rows.push(...list);
    if (!list.length || rows.length >= Number(body.totalCount ?? 0)) break;
  }
  const by = new Map();
  for (const r of rows) { if (!r.pblancId) continue; const g = by.get(r.pblancId) ?? { r, gu: new Set() }; if (r.signguNm) g.gu.add(r.signguNm); by.set(r.pblancId, g); }
  const today = todayKst();
  return [...by].map(([id, { r, gu }]) => { const gus = [...gu], city = cityOf(r.brtcNm);
    return { feedId: `myhome-${id}`, org: orgOf(r.suplyInsttNm), title: String(r.pblancNm || '').trim(), region: gus.length ? `${city} ${gus[0]}${gus.length > 1 ? ` 외 ${gus.length - 1}곳` : ''}` : city,
      kind: r.suplyTyNm || r.houseTyNm || '', posted: ymd(r.rcritPblancDe), from: ymd(r.beginDe), to: ymd(r.endDe), url: r.pcUrl || r.url || '' }; })
    .filter(i => i.title && (!i.to || i.to >= today));
}

// LH 분양임대공고문 (data.go.kr 15058530): 응답 [ {dsSch}, {dsList, resHeader} ] · 목록에는 접수 시작일이 없어 to(마감일)만
export async function fetchLH({ cnpCd = '11', daysBack = 90 } = {}) {
  const dot = s => s.replaceAll('-', '.'), rows = [];
  for (const type of LH_TYPES) for (let page = 1; page <= 5; page++) {
    const data = await getJson('LH API', LH, { PG_SZ: '100', PAGE: String(page), UPP_AIS_TP_CD: type, CNP_CD: cnpCd,
      PAN_ST_DT: todayKst(-daysBack).replaceAll('-', ''), PAN_ED_DT: todayKst().replaceAll('-', ''), PAN_NT_ST_DT: dot(todayKst(-daysBack)), CLSG_DT: dot(todayKst(365)) });
    const list = (Array.isArray(data) ? data : [data]).find(p => Array.isArray(p?.dsList))?.dsList ?? [];
    rows.push(...list);
    if (list.length < 100 || page * 100 >= Number(list[0]?.ALL_CNT ?? 0)) break;
  }
  const seen = new Set(), today = todayKst(), out = [];
  for (const r of rows) {
    const id = r.PAN_ID || r.DTL_URL?.match(/PAN_ID:(\d+)/)?.[1]; if (!id || seen.has(id)) continue; seen.add(id);
    const i = { feedId: `lh-${id}`, org: 'LH', title: String(r.PAN_NM || '').trim(), region: cityOf(r.CNP_CD_NM), kind: r.AIS_TP_CD_NM || r.UPP_AIS_TP_NM || '',
      posted: ymd(r.PAN_NT_ST_DT || r.PAN_DT), from: '', to: ymd(r.CLSG_DT), url: r.DTL_URL || 'https://apply.lh.or.kr' };
    if (i.title && (!i.to || i.to >= today)) out.push(i);
  }
  return out;
}

// 같은 공고 판단용 이름: 공백·기호·[정정] 같은 머리말 제거
export function normTitle(t = '') {
  return t.replace(/^\s*(\[[^\]]*\]|【[^】]*】)\s*/g, m => (/정정|재공고|변경|추가|최초|민간|공공/.test(m) ? '' : m))
    .replace(/공고문?$/, '').replace(/[\s\[\]【】()（）<>「」『』·・.,\-_'"“”‘’~:/]/g, '').toLowerCase();
}
// LH 먼저(기관 공식), 같은 이름·같은 마감일(한쪽이 비었으면 이름만)이면 하나로 합치고 빈 칸은 뒤 출처로 채운다
export function buildFeed(raw) {
  const rank = i => ({ lh: 0, myhome: 2 })[i.feedId.split('-')[0]] ?? 9, groups = [];
  for (const it of [...raw].sort((a, b) => rank(a) - rank(b))) {
    const key = normTitle(it.title), g = groups.find(x => x.key === key && (!x.item.to || !it.to || x.item.to === it.to));
    if (!g) { groups.push({ key, item: { ...it } }); continue; }
    for (const f of ['region', 'kind', 'posted', 'from', 'to', 'url']) if (!g.item[f] && it[f]) g.item[f] = it[f];
    if (g.item.region && it.region && it.region.length > g.item.region.length && it.region.startsWith(g.item.region)) g.item.region = it.region;
  }
  const today = todayKst(), cutoff = todayKst(-NO_PERIOD_DAYS);
  const items = groups.map(g => g.item).filter(i => i.region.startsWith('서울') && (i.to ? i.to >= today : i.posted && i.posted >= cutoff))   // 서울 공고만
    .map(i => ({ id: i.feedId, org: i.org, title: i.title, region: i.region || '', kind: i.kind || '', posted: i.posted || '', from: i.from || '', to: i.to || '', url: /^https?:\/\//.test(i.url || '') ? i.url : '' }))
    .sort((a, b) => (a.to || '9999').localeCompare(b.to || '9999') || b.posted.localeCompare(a.posted));
  return { updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + '+09:00', source: SOURCE_LABEL, items };
}
// 내용이 같고 같은 날이면 다시 쓰지 않는다 (커밋을 줄인다)
export async function writeFeed(feed, out = FEED_OUT) {
  let prev = null; try { prev = JSON.parse(await readFile(out, 'utf8')); } catch { /* 처음 */ }
  if (prev && JSON.stringify(prev.items) === JSON.stringify(feed.items) && String(prev.updated).slice(0, 10) === feed.updated.slice(0, 10)) return false;
  await writeFile(out, JSON.stringify(feed, null, 1) + '\n', 'utf8'); return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const got = await Promise.allSettled([fetchLH(), fetchMyHome()]), raw = [], bad = [];
  got.forEach((r, i) => r.status === 'fulfilled' ? raw.push(...r.value) : bad.push(`${['LH', '마이홈'][i]}: ${scrub(r.reason?.message)}`));
  for (const b of bad) console.error('실패 ·', b);
  if (bad.length === got.length) { console.error('모든 출처가 실패해서 피드를 그대로 둡니다.'); process.exit(1); }
  const feed = buildFeed(raw), wrote = await writeFeed(feed);
  console.log(`공고 ${feed.items.length}건 (${raw.length}건 합침) · ${wrote ? '새로 씀' : '바뀐 것 없음'}`);
}
