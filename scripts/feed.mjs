// 공고 피드 만들기: 마이홈포털·LH 공식 API(공공데이터포털) → feed/notices.json
// GitHub Actions(.github/workflows/feed.yml)가 돌린다. 인증키는 저장소 Secrets 의 DATA_GO_KR_KEY — URL·로그·파일 어디에도 남기지 않는다.
// 서울 공고만 (API 요청도 서울 코드 11 · 합친 뒤 지역이 '서울'로 시작하는 것만). SH 는 API 에 없어 공고 게시판(주택임대·주택분양) 목록을, 서울 청년안심주택은 모집공고 목록 JSON 을 읽는다 (2026-11-06 결정).
// 출처 코드: jev-harness src/sources/{datagokr,myhome,lh}.js · src/feed.js 를 패키지 없이 옮김 (Node 20+)
// 사용: DATA_GO_KR_KEY=... node scripts/feed.mjs      검사: node scripts/verify/feed_check.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { addDetails, pageText } from './detail.mjs';

export const FEED_OUT = fileURLToPath(new URL('../feed/notices.json', import.meta.url));
const SOURCE_LABEL = '마이홈포털·LH 공식 API · SH·청년안심주택 게시판';
const MYHOME = 'https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList';
const LH = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
const LH_TYPES = ['06', '13', '39'];   // 임대주택 · 주거복지 · 신혼희망타운
const NO_PERIOD_DAYS = 21;             // 마감일이 없는 공고(SH 게시판 등)는 게시 후 이 일수까지만
const SH = 'https://www.i-sh.co.kr/app/lay2/program';
const SH_BOARDS = [{ path: 'S48T1581C563/www/brd/m_247', seq: '2', kind: '임대' }, { path: 'S48T1581C1617/www/brd/m_244', seq: '1', kind: '분양' }];   // 주택임대 · 주택분양

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
  for (const r of rows) { if (!r.pblancId) continue; const g = by.get(r.pblancId) ?? { r, gu: new Set(), all: [] }; if (r.signguNm) g.gu.add(r.signguNm); g.all.push(r); by.set(r.pblancId, g); }
  const today = todayKst();
  return [...by].map(([id, { r, gu, all }]) => { const gus = [...gu], city = cityOf(r.brtcNm);
    return { feedId: `myhome-${id}`, org: orgOf(r.suplyInsttNm), title: String(r.pblancNm || '').trim(), region: gus.length ? `${city} ${gus[0]}${gus.length > 1 ? ` 외 ${gus.length - 1}곳` : ''}` : city,
      kind: r.suplyTyNm || r.houseTyNm || '', posted: ymd(r.rcritPblancDe), from: ymd(r.beginDe), to: ymd(r.endDe), url: r.pcUrl || r.url || '', basic: myhomeBasic(all) }; })
    .filter(i => i.title && (!i.to || i.to >= today));
}

// 마이홈 API 한 줄(단지)마다 들어 있는 기본 정보 → 상세보기용 (자격 조건은 API 에 없다 · 공고문 PDF 는 해외 서버에서 못 받음)
const won = v => { const n = Number(v); return n > 0 ? (n >= 1e4 ? `${(n / 1e4).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원` : `${n.toLocaleString('ko-KR')}원`) : ''; };
const dot = v => { const d = ymd(v); return d ? d.replaceAll('-', '.') : ''; };
export function myhomeBasic(rows) {
  const r = rows[0] || {}, txt = v => String(v ?? '').trim();
  return { target: null, eligibility: [], income: null, asset: null, car: null,
    supply: rows.slice(0, 10).map(x => ({ type: txt(x.hsmpNm) || null, area: txt(x.houseTyNm) || null, units: Number(x.totHshldCo) > 0 ? `총 ${x.totHshldCo}세대` : null,
      price: [won(x.rentGtn) && `보증금 ${won(x.rentGtn)}`, won(x.enty) && `계약금 ${won(x.enty)}`, won(x.mtRntchrg) && `월 ${won(x.mtRntchrg)}`].filter(Boolean).join(' · ') || null, movein: null })),
    schedule: [r.beginDe && { label: '접수', date: `${dot(r.beginDe)}${r.endDe && r.endDe !== r.beginDe ? ` ~ ${dot(r.endDe)}` : ''}` }, r.przwnerPresnatnDe && { label: '당첨자 발표', date: dot(r.przwnerPresnatnDe) }].filter(Boolean),
    apply: /^https?:\/\//.test(txt(r.url)) ? `공급기관 공고: ${txt(r.url)}` : null, costs: [], special: [], contact: txt(r.refrnc) || null, addr: txt(r.fullAdres) || null };
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

// SH 공고 게시판: 목록 HTML 의 제목·게시일만 쓴다 (상세 글은 형식이 제각각이라 마감일을 읽지 않음 → 게시 후 NO_PERIOD_DAYS 일까지)
const SH_SKIP = /당첨|발표|채용|돌보미|사무지원|연장|게시|안내|명단|결과|재계약|서류/;   // 모집공고가 아닌 글
const SEOUL_GU = '강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 동작구 마포구 서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 종로구 중랑구'.split(' ');   // 중구는 다른 이름과 헷갈려 뺌
const SH_KINDS = ['청년안심주택', '행복주택', '장기전세', '국민임대', '영구임대', '매입임대', '전세임대', '사회주택', '도전숙', '희망하우징', '미리내집', '토지임대부', '신혼부부'];
const unHtml = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
export function parseSHList(html, board) {
  const out = [];
  for (const m of String(html).matchAll(/getDetailView\('(\d+)'\)[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="num">\s*(\d{4}-\d{2}-\d{2})/g)) {
    const title = unHtml(m[2]).replace(/^NEW\s*/, '');
    if (!/모집/.test(title) || SH_SKIP.test(title)) continue;
    const gu = SEOUL_GU.find(g => title.includes(g));
    out.push({ feedId: `sh-${m[1]}`, org: 'SH', title, region: gu ? `서울 ${gu}` : '서울', kind: SH_KINDS.find(k => title.includes(k)) || board.kind,
      posted: m[3], from: '', to: '', url: `${SH}/${board.path}/view.do?multi_itm_seq=${board.seq}&seq=${m[1]}` });
  }
  return out;
}
export async function fetchSH({ pages = 4 } = {}) {   // 한 쪽 10개 · 4쪽이면 보통 3주 넘게
  const out = [];
  for (const b of SH_BOARDS) for (let page = 1; page <= pages; page++) {
    let res; try { res = await fetch(`${SH}/${b.path}/list.do`, { method: 'POST', body: new URLSearchParams({ page: String(page), multi_itm_seq: b.seq, seq: '' }),   // 쪽 넘김은 POST 로만 됨
      headers: { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)' }, signal: AbortSignal.timeout(20000) }); }
    catch (e) { throw new Error(`SH 게시판: 연결 실패 (${e?.cause?.code || e?.name || 'network'})`); }
    if (!res.ok) throw new Error(`SH 게시판: HTTP ${res.status}`);
    const html = await res.text(); if (!html.includes('getDetailView')) throw new Error('SH 게시판: 목록 모양이 바뀜');
    out.push(...parseSHList(html, b));
  }
  return [...new Map(out.map(i => [i.feedId, i])).values()];
}

// 서울 청년안심주택 모집공고 (soco.seoul.go.kr): 목록 화면이 부르는 JSON. optn1 = 공고게시일, optn4 = 청약신청 '시작일'
// 마감일은 상세 게시판 본문의 '■청약신청 : ‘26. 11. 09. (월) ~ 11. 10. (화) 00:00 ~ 23:00' 줄에서 읽는다 (parseDue). 못 읽으면 시작일을 to 로 두고 startOnly
export function parseDue(text, start = '') {
  const line = String(text).split('\n').map(l => l.match(/청약\s*신청\s*[:：]\s*(.+)/)?.[1]).find(Boolean); if (!line) return null;
  const ds = [...line.matchAll(/(?:[‘'’](\d{2})\.\s*|(\d{4})\.\s*)?(\d{1,2})\.\s*(\d{1,2})\.?\s*\(/g)]; if (!ds.length) return null;
  let y = ds[0][1] ? 2000 + +ds[0][1] : ds[0][2] ? +ds[0][2] : +(start.slice(0, 4) || new Date().getFullYear()), pm = 0;
  const out = ds.map(m => { if (m[1] || m[2]) y = m[1] ? 2000 + +m[1] : +m[2]; else if (+m[3] < pm) y++; pm = +m[3]; return `${y}-${String(m[3]).padStart(2, '0')}-${String(m[4]).padStart(2, '0')}`; });
  const from = out[0], to = out.at(-1), tm = [...line.matchAll(/(\d{1,2}):(\d{2})/g)].at(-1);
  if (to < from || Date.parse(to) - Date.parse(from) > 90 * 864e5) return null;   // 이상하게 읽힘
  return { from, to, time: tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : '' };
}
const YOUTH = 'https://soco.seoul.go.kr/youth';
export function parseYouth(data) {
  return (data?.resultList ?? []).filter(r => r?.boardId && r.nttSj).map(r => {
    const title = unHtml(r.nttSj), to = ymd(r.optn4);
    return { feedId: `youth-${r.boardId}`, org: '청년안심', title, region: '서울', kind: r.optn2 === '1' ? '청년안심주택(공공)' : r.optn2 === '2' ? '청년안심주택(민간)' : '청년안심주택',
      posted: ymd(r.optn1), from: '', to, startOnly: !!to, url: `${YOUTH}/bbs/BMSR00015/view.do?boardId=${encodeURIComponent(r.boardId)}&menuNo=400008` };
  });
}
export async function fetchYouth({ pages = 3 } = {}) {   // 한 쪽 10개 · 신청일이 지난 것은 buildFeed 가 뺀다
  const out = [];
  for (let page = 1; page <= pages; page++) {
    let res; try { res = await fetch(`${YOUTH}/pgm/home/yohome/bbsListJson.json`, { method: 'POST', body: new URLSearchParams({ bbsId: 'BMSR00015', pageIndex: String(page) }),
      headers: { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); }
    catch (e) { throw new Error(`청년안심주택: 연결 실패 (${e?.cause?.code || e?.name || 'network'})`); }
    if (!res.ok) throw new Error(`청년안심주택: HTTP ${res.status}`);
    let data; try { data = await res.json(); } catch { throw new Error('청년안심주택: JSON 아님'); }
    if (!Array.isArray(data?.resultList)) throw new Error('청년안심주택: 목록 모양이 바뀜');
    out.push(...parseYouth(data)); if (page >= Number(data.pagingInfo?.totPage ?? 1)) break;
  }
  const items = [...new Map(out.map(i => [i.feedId, i])).values()], since = todayKst(-30);
  for (const i of items) if (i.to && i.to >= since) {   // 아직 열려 있을 수 있는 것만 상세를 열어 마감일을 읽는다 (실패해도 시작일로 둔다)
    try { const r = await fetch(i.url, { headers: { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)' }, signal: AbortSignal.timeout(20000) });
      const d = r.ok ? parseDue(pageText(await r.text(), i.title), i.to) : null; if (d) Object.assign(i, d, { startOnly: false }); } catch { /* 시작일 그대로 */ }
  }
  return items;
}

export const FIX_RE = /정정|변경|재공고/;
export const fixKey = t => normTitle(String(t).replace(/[\[(【<]\s*(정정|변경|재)\s*(공고)?\s*[\])】>]/g, '').replace(/(정정|변경|재)\s*공고|정정|변경/g, ''));
// 같은 공고 판단용 이름: 공백·기호·[정정] 같은 머리말 제거
export function normTitle(t = '') {
  return t.replace(/^\s*(\[[^\]]*\]|【[^】]*】)\s*/g, m => (/정정|재공고|변경|추가|최초|민간|공공/.test(m) ? '' : m))
    .replace(/공고문?$/, '').replace(/[\s\[\]【】()（）<>「」『』·・.,\-_'"“”‘’~:/]/g, '').toLowerCase();
}
// LH 먼저(기관 공식), 같은 이름·같은 마감일(한쪽이 비었으면 이름만)이면 하나로 합치고 빈 칸은 뒤 출처로 채운다
export function buildFeed(raw) {
  const rank = i => ({ lh: 0, sh: 1, youth: 1, myhome: 2 })[i.feedId.split('-')[0]] ?? 9, groups = [];
  for (const it of [...raw].sort((a, b) => rank(a) - rank(b))) {
    const key = normTitle(it.title), g = groups.find(x => x.key === key && (!x.item.to || !it.to || x.item.to === it.to));
    if (!g) { groups.push({ key, item: { ...it } }); continue; }
    for (const f of ['region', 'kind', 'posted', 'from', 'to', 'time', 'url']) if (!g.item[f] && it[f]) g.item[f] = it[f];
    if (g.item.region && it.region && it.region.length > g.item.region.length && it.region.startsWith(g.item.region)) g.item.region = it.region;
  }
  const today = todayKst(), cutoff = todayKst(-NO_PERIOD_DAYS);
  let items = groups.map(g => g.item).filter(i => i.region.startsWith('서울') && (i.to ? i.to >= today : i.posted && i.posted >= cutoff))   // 서울 공고만
    .map(i => ({ id: i.feedId, org: i.org, title: i.title, region: i.region || '', kind: i.kind || '', posted: i.posted || '', from: i.from || '', to: i.to || '', url: /^https?:\/\//.test(i.url || '') ? i.url : '', time: i.time || '', startOnly: !!i.startOnly, detail: false, dv: '' }))   // dv: 상세 파일 내용 해시 (사이트가 ?v= 로 붙여 예전 캐시를 피함)   // time: 마감 시각 · startOnly: to 가 사실은 시작일(마감일 모름)   // detail: feed/detail/{id}.json 이 있으면 true (addDetails)
    .sort((a, b) => (a.to || '9999').localeCompare(b.to || '9999') || b.posted.localeCompare(a.posted));
  // 정정공고: 제목에 정정·변경·재공고가 있고 같은 기관·같은 단지(정정 글자를 뺀 이름)의 더 예전 공고가 있으면 예전 것은 숨긴다 (사이트는 새 공고에 '정정공고' 배지)
  const gone = new Set();
  for (const c of items) if (FIX_RE.test(c.title)) for (const o of items)
    if (o !== c && o.org === c.org && fixKey(o.title) === fixKey(c.title) && (o.posted || '') <= (c.posted || '') && !(FIX_RE.test(o.title) && o.posted === c.posted)) gone.add(o.id);
  items = items.filter(i => !gone.has(i.id));
  return { updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + '+09:00', source: SOURCE_LABEL, items };
}
// 내용이 같고 같은 날이면 다시 쓰지 않는다 (커밋을 줄인다)
export async function writeFeed(feed, out = FEED_OUT) {
  let prev = null; try { prev = JSON.parse(await readFile(out, 'utf8')); } catch { /* 처음 */ }
  if (prev && JSON.stringify(prev.items) === JSON.stringify(feed.items) && String(prev.updated).slice(0, 10) === feed.updated.slice(0, 10)) return false;
  await writeFile(out, JSON.stringify(feed, null, 1) + '\n', 'utf8'); return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const got = await Promise.allSettled([fetchLH(), fetchMyHome(), fetchSH(), fetchYouth()]), raw = [], bad = [];
  got.forEach((r, i) => r.status === 'fulfilled' ? raw.push(...r.value) : bad.push(`${['LH', '마이홈', 'SH', '청년안심주택'][i]}: ${scrub(r.reason?.message)}`));
  for (const b of bad) console.error('실패 ·', b);
  if (bad.length === got.length) { console.error('모든 출처가 실패해서 피드를 그대로 둡니다.'); process.exit(1); }
  const feed = buildFeed(raw), det = await addDetails(feed.items, { basics: new Map(raw.filter(r => r.basic).map(r => [r.feedId, r.basic])) }), wrote = await writeFeed(feed);
  console.log(`공고 ${feed.items.length}건 (${raw.length}건 합침) · 상세 ${det.have}건 (이번에 ${det.made}건 읽음${det.skipped ? ` · 다시 읽기 ${det.skipped}건 미룸` : ''}${det.stopped ? ` · 멈춤: ${det.stopped}` : ''}) · ${wrote ? '새로 씀' : '바뀐 것 없음'}`);
}
