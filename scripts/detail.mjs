// 공고 상세(신청 조건 요약): 공고문 PDF 를 받아 Gemini 가 읽은 내용을 feed/detail/{id}.json 으로 둔다 (사이트 '상세보기')
// feed.mjs 가 피드를 만든 뒤 부른다. 키는 저장소 Secrets 의 GEMINI_API_KEY (자동 갱신 전용 프로젝트 키) — URL·로그·파일에 남기지 않는다.
// 한 번 읽은 공고는 다시 읽지 않는다 · 한 번에 MAX_NEW 개까지 · 3번 실패한 공고는 그만 · 429(사용량 다 참)면 이번 실행은 멈춘다
import { readFile, writeFile, mkdir, readdir, unlink, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

export const DETAIL_DIR = fileURLToPath(new URL('../feed/detail/', import.meta.url));
export const DEFER_LOG = process.env.DETAIL_DEFER_LOG || fileURLToPath(new URL('../docs/work/미룸.md', import.meta.url));   // 검사는 DETAIL_DEFER_LOG 로 임시 파일에   // 마감까지 계속 미뤄진 공고 (인수인계 문서에서 링크)
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];   // 사이트 AI_MODELS 와 같은 순서
const MAX_NEW = 5, MAX_TRY = 3, MAX_PDF = 15 * 1048576, MAX_TEXT = 6000;
export const DETAIL_V = 5;   // 읽는 방법을 바꾸면 올린다 → 예전 상세는 다시 읽음 (v2: 게시판 본문도 함께 보냄 · v3: 신청 방법·입주 기간·부담 비용·호수 · v4: 문의·신청 페이지를 본문에서 채움 · v5: 비용 예시 · 모델 기록)
const UA = { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)' };
const RETRY_MS = Number(process.env.DETAIL_RETRY_MS ?? 30000);   // 503(붐빔) 뒤 한 번 더 기다리는 시간 (검사는 짧게)

export const DETAIL_PROMPT = `첨부한 주택 입주자 모집공고문을 읽고, 신청하려는 사람이 알아야 할 조건만 아래 형식의 JSON 하나로 정리해줘. 설명 문장 없이 JSON만.
- 공고문에 적힌 내용만 쓴다. 없으면 null 이나 빈 배열. 짐작하거나 지어내지 마.
- 문장은 짧고 쉬운 말로 (한 항목 80자 이내). 금액·날짜는 공고문 표기 그대로 단위까지.
- target: 누가 신청할 수 있는지 한 줄 (예: '만 19~39세 무주택 미혼 청년').
- eligibility: 신청 자격 조건 목록 (나이·혼인·무주택·거주지·청약통장 등), 최대 8개.
- income, asset, car: 소득·총자산·자동차 기준 한 줄씩 (예: '전년도 도시근로자 월평균소득 100% 이하').
- supply: 주택형(또는 호실)마다 type, area(전용면적), units(모집 세대), price(보증금·월임대료 또는 분양가), movein(그 호실의 입주 기간·입주 가능일), 최대 10개.
  type 에는 주택형과 호수를 함께 쓴다 (예: '25A 1510호'). 공고문에 호수가 있으면 한 행도 빠짐없이 모든 행에 호수를 쓴다.
- apply: 신청 방법 한 줄 (인터넷·방문·우편 등, 신청 페이지 주소가 있으면 주소 그대로 — 예: 네이버폼 https://naver.me/…).
- costs: 임차인이 부담하는 비용·돈 조건 목록, 최대 6개. 예: 보증보험(보증) 수수료 부담 비율(예: '보증수수료 75% 임대사업자 · 25% 임차인 부담, 임대료와 별도'), 해약금·위약금(예: '개인 사유로 계약 해지 시 해약금 100만원'), 관리비·관리비 예치금, 잔금·임대료 선납 조건(예: '잔금일이 주말·공휴일이면 사전 납부, 선납 할인 없음'). 공고문에 있으면 빠짐없이.
- schedule: 접수·서류 제출·발표·계약 일정 (label, date).
- special: 가점·우선순위·특이사항과 주의할 점 (한부모·다자녀·세대 분리·부모 소득 합산·거주 기간 등이 있으면 꼭), 최대 8개.
- contact: 문의처 한 줄 (전화번호 포함).
- 함께 보내는 '게시판 본문'에도 일정·문의·신청 방법이 적혀 있을 수 있다. schedule 과 contact 는 공고문이나 본문 어디든 있으면 반드시 채운다.`;
const S = { type: 'STRING', nullable: true }, SA = { type: 'ARRAY', items: { type: 'STRING' } };
export const DETAIL_SCHEMA = { type: 'OBJECT', required: ['target', 'eligibility'], properties: {
  target: S, eligibility: SA, income: S, asset: S, car: S,
  supply: { type: 'ARRAY', items: { type: 'OBJECT', properties: { type: S, area: S, units: S, price: S, movein: S } } },
  apply: S, costs: SA,
  schedule: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: S, date: S } } },
  special: SA, contact: S } };

export function geminiKey() { return (process.env.GEMINI_API_KEY || '').trim(); }
export const scrubKey = m => { const k = geminiKey(); let s = String(m ?? ''); if (k.length >= 8) s = s.split(k).join('***'); return s.replace(/(key=)[^&\s]+/gi, '$1***'); };
const abs = (base, p) => new URL(p.replace(/&amp;/g, '&'), base).href;
async function get(url, opt = {}) {
  let r; try { r = await fetch(url, { ...opt, headers: { ...UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(30000) }); }
  catch (e) { throw Object.assign(new Error(`${e?.name === 'TimeoutError' ? '시간 초과' : '연결 실패'} (${e?.cause?.code || e?.name || 'network'})`), { transient: true }); }
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { transient: r.status === 429 || r.status >= 500 }); return r;   // 404·403 은 실패로 센다
}
const pick = list => list.find(f => /\.pdf$/i.test(f.name) && /공고/.test(f.name)) || list.find(f => /\.pdf$/i.test(f.name));

// 공고문 PDF 찾기 (출처마다 다르다) → { url, method, body } 또는 null
export function pdfFromYouthView(html, base) {   // 청년안심주택 상세: /coHouse/cmmn/file/fileDown.do 링크
  const list = [...String(html).matchAll(/href="(\/coHouse\/cmmn\/file\/fileDown\.do\?[^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)].map(m => ({ url: abs(base, m[1]), path: m[1].replace(/&amp;/g, '&'), name: m[2].trim() }));
  const f = pick(list); return f ? { url: f.url, att: `${f.path}|${f.name}` } : null;   // att: 첨부 식별자(atchFileId·fileSn) + 파일명
}
export function shFiles(html) {   // SH 상세: initParam.downList = [{brdId, seq, fileSeq, oriFileNm}]
  const m = String(html).match(/initParam\.downList\s*=\s*(\[[\s\S]*?\]);/); if (!m) return [];
  try { return JSON.parse(m[1]).map(f => ({ ...f, name: String(f.oriFileNm || '') })); } catch { return []; }
}
export function shPdfFromViewer(viewerUrl) {   // 미리보기가 넘겨 주는 주소 …/doc.html?fn=파일이름&rs=/app/upload/bbs/…/html/ → 원본 PDF
  const u = new URL(viewerUrl), fn = u.searchParams.get('fn'), rs = u.searchParams.get('rs');
  return fn && rs && /^\/app\/upload\//.test(rs) ? `${u.origin}${rs.replace(/html\/?$/, '')}${fn}.pdf` : null;
}
export function pdfFromMyHomeView(html) {   // 마이홈포털 상세: 공고문 칸의 fnDownFile('atchFileId', 'fileSn') → POST cvplFileDownload.do
  const list = [...String(html).matchAll(/fnDownFile\('([^']+)',\s*'(\d+)'\)"?[^>]*>\s*([^<]+?)\s*<\/a>/g)].map(m => ({ id: m[1], sn: m[2], name: m[3].trim() }));
  const f = pick(list); return f ? { url: 'https://www.myhome.go.kr/hws/com/fms/cvplFileDownload.do', method: 'POST', body: new URLSearchParams({ atchFileId: f.id, fileSn: f.sn }) } : null;
}
// 게시판 본문 글 (일정·문의가 PDF 보다 여기에 잘 정리된 곳이 많다): 태그를 빼고, 제목이 처음 나오는 곳부터 '다음글'/'목록' 앞까지
export function pageText(html, title = '') {
  let t = String(html).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const key = title.replace(/^\s*(\[[^\]]*\]\s*)+/, '').slice(0, 12), i = key ? t.indexOf(key) : -1; if (i > 0) t = t.slice(i);
  const j = t.search(/\n(다음글|이전글|목록)(\s|$)/); if (j > 0) t = t.slice(0, j);
  return t.slice(0, MAX_TEXT);
}
// 첨부 확인: 게시판 상세 페이지만 받아 첨부 식별자(att)·본문을 얻는다. PDF 주소는 pdf() 를 불러야 만든다 (SH 는 미리보기 주소를 한 번 더 받아야 해서)
// myhome: addDetails 가 API 기본 정보(basics)로 상세를 만들고 여기는 부르지 않는다 (해외 서버에서 마이홈 상세 페이지가 시간 초과) · LH 등: 아직 모름 → null
export async function findAttach(item) {
  const src = item.id.split('-')[0]; if (!['youth', 'sh'].includes(src)) return null;
  const html = await (await get(item.url)).text(), text = pageText(html, item.title);
  if (src === 'youth') { const f = pdfFromYouthView(html, item.url); return f ? { att: f.att, text, pdf: async () => ({ url: f.url }) } : null; }
  const f = pick(shFiles(html)); if (!f) return null;
  return { att: `brd=${f.brdId}&seq=${f.seq}&file=${f.fileSeq}|${f.name}`, text, pdf: async () => {
    const r = await get(`https://www.i-sh.co.kr/app/com/util/htmlConverter.do?brd_id=${encodeURIComponent(f.brdId)}&seq=${encodeURIComponent(f.seq)}&data_tp=A&file_seq=${encodeURIComponent(f.fileSeq)}`);
    const url = shPdfFromViewer(r.url); return url ? { url } : null; } };
}
export async function findPdf(item) {
  const a = await findAttach(item); if (!a) return null; const p = await a.pdf();
  return p ? { ...p, text: a.text, att: a.att } : null;
}
async function downloadPdf(p) {
  const r = await get(p.url, p.method ? { method: p.method, body: p.body } : {}), buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_PDF) throw new Error(`PDF 가 너무 큼 (${(buf.length / 1048576).toFixed(1)}MB)`);
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF 가 아님');
  return buf;
}

// Gemini 로 읽기 (cheongyak-check 프로젝트 한도 2026-11-07 AI Studio: 3.6-flash RPM 5·RPD 20 · 3.5-flash-lite RPM 15·RPD 500 · 하루는 미국 태평양 시간 자정에 초기화)
// · 첫 모델 하루 예산 PRIMARY_BUDGET(18, 여유 2) — 태평양 날짜 기준으로 _quota.json 에 센다(429·503 시도도 센다). 예산이 다 차면 그날은 부르지 않는다 (429 로 알아내지 않음)
// · 호출 간격: 첫 모델 13초 · lite 5초 (RPM 5 · 15 아래로)
// · 429: 그 모델은 그 실행에서 즉시 그만 (재시도 없음) · 503: RETRY_MS(30초) 뒤 1번만 다시 · 연결 실패·시간 초과는 붐빔처럼
// · models: 다시 읽기는 [첫 모델], 새 공고 첫 읽기는 [lite] (addDetails 가 정함). 쓸 모델이 모두 막히면 { skip } (실패로 안 셈 · 다음 갱신에)
export const PRIMARY_BUDGET = Number(process.env.DETAIL_PRIMARY_BUDGET ?? 18);
const GAP = { [MODELS[0]]: Number(process.env.DETAIL_GAP_PRIMARY_MS ?? 13000), [MODELS[1]]: Number(process.env.DETAIL_GAP_LITE_MS ?? 5000) };
export const ptDay = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
const spent = new Set(), used = {}, lastAt = {};   // used: 이번 실행에서 모델마다 부른 횟수 { 모델: { calls, s429, s503 } }
let quota = { day: '', used: {} };   // 태평양 날짜별 모델 사용 횟수 (addDetails 가 _quota.json 에서 읽고 씀)
export const geminiUse = () => JSON.parse(JSON.stringify(used));
export const primaryLeft = () => Math.max(0, PRIMARY_BUDGET - (quota.used[MODELS[0]] || 0));
const blocked = m => spent.has(m) || (m === MODELS[0] && primaryLeft() <= 0);
async function pace(m) { const w = (lastAt[m] || 0) + (GAP[m] ?? 0) - Date.now(); if (w > 0) await new Promise(s => setTimeout(s, w)); lastAt[m] = Date.now(); }
// 로컬(이 Mac 등) 실행은 실제 Gemini 를 부르지 않는다: GitHub Actions(GITHUB_ACTIONS=true)나 검사(DETAIL_TEST=1, 가짜 fetch)만 부름.
// 꼭 실제로 불러야 하면 DETAIL_ALLOW_REAL=1 — 그 호출도 addDetails 가 _quota.json 에 더하니, 끝나면 _quota.json 을 커밋·push 해서 Actions 와 맞춘다
export const realCallAllowed = () => process.env.GITHUB_ACTIONS === 'true' || process.env.DETAIL_TEST === '1' || process.env.DETAIL_ALLOW_REAL === '1';
export async function askGemini(pdf, text = '', { models = MODELS } = {}) {
  const key = geminiKey(); if (!key) throw Object.assign(new Error('GEMINI_API_KEY 없음'), { stop: true });
  if (!realCallAllowed()) throw Object.assign(new Error('로컬 실행: 실제 Gemini 를 부르지 않음 (Actions 에서만 · 꼭 필요하면 DETAIL_ALLOW_REAL=1 · _quota.json 커밋)'), { stop: true });
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: DETAIL_PROMPT }, { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } }, ...(text ? [{ text: `게시판 본문:\n${text}` }] : [])] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: DETAIL_SCHEMA } });
  const end = [];   // 모델마다 끝난 까닭: 'spent'(429·오늘 예산) · 'busy'(503 두 번·연결) · 'err'
  let last = '';
  for (const m of models) {
    if (blocked(m)) { end.push('spent'); last = spent.has(m) ? `${m}: 429 사용량 다 참` : `${m}: 오늘 예산 다 씀 (${PRIMARY_BUDGET}/${PRIMARY_BUDGET})`; continue; }
    let why = 'err';
    for (let n = 0; n < 2; n++) {
      if (blocked(m)) { why = 'spent'; last = `${m}: 오늘 예산 다 씀 (${PRIMARY_BUDGET}/${PRIMARY_BUDGET})`; break; }   // 503 재시도 직전에 예산이 찼으면 그만
      await pace(m);
      const u = used[m] ??= { calls: 0, s429: 0, s503: 0 }; u.calls++; quota.used[m] = (quota.used[m] || 0) + 1;
      let r; try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(120000) }); }
      catch (e) { why = 'busy'; last = `${m}: ${e?.name === 'TimeoutError' ? '시간 초과' : '연결 실패'}`; break; }   // 연결 실패·시간 초과는 붐빔처럼 (미룸)
      if (r.status === 429) { u.s429++; spent.add(m); why = 'spent'; last = `${m}: 429 사용량 다 참`; break; }   // 재시도 없음
      if (r.status === 503) { u.s503++; if (n === 0) { await new Promise(s => setTimeout(s, RETRY_MS)); continue; } why = 'busy'; last = `${m}: 503 붐빔`; break; }
      if (!r.ok) { last = `${m}: HTTP ${r.status}`; if (r.status === 400 || r.status === 403) { const t = await r.text(); if (/API_KEY|PERMISSION/.test(t)) throw Object.assign(new Error(`${m}: 키 오류`), { stop: true }); } break; }
      const t = (await r.json())?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
      try { return { data: JSON.parse(t), model: m }; } catch { last = `${m}: JSON 아님`; break; }
    }
    end.push(why);
  }
  if (end.every(x => x === 'spent' || x === 'busy')) throw Object.assign(new Error(`${last} · 다음 갱신에`), { skip: true });
  throw new Error(last || 'Gemini 실패');
}

// AI 가 비워 둔 문의처·신청 페이지를 게시판 본문의 '■ 문의전화 : …' · '■ 청약신청 페이지 : https://…' 줄에서 채운다 (모양이 정해진 줄만)
export function fillFromText(d, text = '') {
  const t = String(text), line = re => t.split('\n').map(l => l.match(re)?.[1]?.trim()).find(Boolean);
  if (d && !d.contact) d.contact = line(/문의\s*(?:전화|처)\s*[:：]\s*(.{4,80})/) || null;
  if (d && !d.apply) { const u = line(/(?:청약\s*)?신청\s*(?:페이지|사이트|링크|주소)\s*[:：]\s*(https?:\/\/\S+)/); d.apply = u ? `인터넷 신청: ${u}` : null; }
  return d;
}
// AI 결과 다듬기: 글자 수·개수 자르기 · 빈 값 빼기 (사이트는 이 모양만 믿는다)
export function cleanDetail(x) {
  const s = (v, n = 160) => typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null;
  const arr = (v, n) => (Array.isArray(v) ? v : []).map(t => s(t)).filter(Boolean).slice(0, n);
  const objs = (v, keys, n) => (Array.isArray(v) ? v : []).map(o => Object.fromEntries(keys.map(k => [k, s(o?.[k], 80)]))).filter(o => keys.some(k => o[k])).slice(0, n);
  const unit = o => (o.units && /^\d+$/.test(o.units) ? { ...o, units: `${o.units}세대` } : o);
  const d = { target: s(x?.target), eligibility: arr(x?.eligibility, 8), income: s(x?.income), asset: s(x?.asset), car: s(x?.car),
    supply: objs(x?.supply, ['type', 'area', 'units', 'price', 'movein'], 10).map(unit), schedule: objs(x?.schedule, ['label', 'date'], 8), apply: s(x?.apply, 200), costs: arr(x?.costs, 6), special: arr(x?.special, 8), contact: s(x?.contact) };
  return d.target || d.eligibility.length ? d : null;
}
// lite 가 읽은 상세를 첫 모델로 다시 읽을 때 칸별 비교 (합치기 전 첫 모델 결과 그대로) → 로그 한 줄 + _compare.jsonl (며칠 모아 lite 로 충분한 칸을 본다)
const KO = { eligibility: '자격', special: '특이', supply: '주택형', schedule: '일정', costs: '비용', target: '대상', income: '소득', asset: '자산', car: '자동차', apply: '신청', contact: '문의' };
export function compareDetail(lite, first) {
  const lists = Object.fromEntries(LIST_KEYS.map(k => [k, [lite?.[k]?.length || 0, first?.[k]?.length || 0]]));
  const lines = Object.fromEntries(LINE_KEYS.map(k => { const a = lite?.[k] || null, b = first?.[k] || null; return [k, a === b ? '같음' : !a ? '채움' : !b ? '비움' : '바뀜']; }));
  const changed = Object.fromEntries(LINE_KEYS.filter(k => lines[k] === '바뀜').map(k => [k, [String(lite[k]).slice(0, 80), String(first[k]).slice(0, 80)]]));
  const text = [...LIST_KEYS.map(k => `${KO[k]} ${lists[k][0]}${lists[k][0] === lists[k][1] ? '=' : '→'}${lists[k][1]}`), ...LINE_KEYS.filter(k => lines[k] !== '같음').map(k => `${KO[k]} ${lines[k]}`)].join(' · ');
  return { lists, lines, changed, text };
}
// 퇴보 막기: 다시 읽은 결과와 예전 결과를 칸마다 합친다 — 목록은 항목이 더 많은 쪽, 한 줄 칸은 새 값이 비었으면 예전 값
export const LIST_KEYS = ['eligibility', 'special', 'supply', 'schedule', 'costs'], LINE_KEYS = ['target', 'income', 'asset', 'car', 'apply', 'contact'];
export function mergeDetail(old, neu) {
  if (!old) return { d: neu, kept: [] }; const d = { ...neu }, kept = [];
  for (const k of LIST_KEYS) if ((old[k]?.length || 0) > (neu[k]?.length || 0)) { d[k] = old[k]; kept.push(k); }
  for (const k of LINE_KEYS) if (!neu[k] && old[k]) { d[k] = old[k]; kept.push(k); }
  return { d, kept };
}

const readJson = async (f, d) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return d; } };
const safeId = id => /^[a-z]+-[\w-]{1,60}$/.test(id);
const nowKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

// items 마다 상세가 있으면 detail: true. 피드에서 빠진 공고의 상세는 지운다
// · basics(id → API 기본 정보): AI 없이 바로 상세로 (마이홈포털)
// · 새 공고 먼저, 그다음 다시 읽기(예전 방법 v < DETAIL_V, 또는 첫 모델이 아닌 모델이 읽은 것) — 합쳐서 한 번에 max 개
// · 다시 읽기는 첫 모델로만 · 첫 모델 사용량이 다 차면 다시 읽기는 건너뜀(실패로 안 셈)
// 실패 분류: 연결 실패·시간 초과·503·429(사용량)·HTTP 5xx = 미룸 (실패로 안 셈, 횟수는 _fail.json 의 defer 와 상세 파일 defer 에) · 404·403·PDF 아님·AI 가 못 읽음 = 실패 (3번이면 그만)
export async function addDetails(items, { dir = DETAIL_DIR, max = MAX_NEW, log = console.log, basics = new Map(), deferLog = DEFER_LOG } = {}) {
  spent.clear(); for (const k in used) delete used[k]; for (const k in lastAt) delete lastAt[k];
  await mkdir(dir, { recursive: true });
  const quotaFile = `${dir}_quota.json`, day = ptDay(); quota = await readJson(quotaFile, { day: '', used: {} }); if (quota.day !== day) quota = { day, used: {} };   // 태평양 날짜가 바뀌면 0부터
  const failFile = `${dir}_fail.json`, fail = await readJson(failFile, {}), have = new Set((await readdir(dir)).filter(f => /\.json$/.test(f) && !f.startsWith('_')).map(f => f.slice(0, -5)));
  const prev = new Map(); for (const id of have) prev.set(id, await readJson(`${dir}${id}.json`, {}));
  const needs = id => { const o = prev.get(id); return !o || o.source === 'api' ? false : (o.v || 1) < DETAIL_V || o.model !== MODELS[0]; };
  for (const it of items) { const b = basics.get(it.id); if (!b || !safeId(it.id)) continue;   // API 기본 정보 → 매번 새로 씀 (AI 안 씀)
    await writeFile(`${dir}${it.id}.json`, JSON.stringify({ id: it.id, v: DETAIL_V, source: 'api', read: nowKst().slice(0, 10), readAt: nowKst(), model: null, ...b }, null, 1) + '\n', 'utf8');
    have.add(it.id); prev.set(it.id, { source: 'api' }); delete fail[it.id]; }
  // 첨부 확인: 이미 읽은 공고는 게시판 페이지만 받아 첨부 식별자를 비교 → 바뀐 것만 PDF 를 다시 받아 원문 해시를 본다 (처음이면 기록만)
  const attChanged = new Set();
  for (const it of items) { const o = prev.get(it.id); if (!o || o.source === 'api' || !safeId(it.id) || needs(it.id)) continue;
    let a; try { a = await findAttach(it); } catch { continue; } if (!a) continue;
    if (!o.att) { o.att = a.att; await writeFile(`${dir}${it.id}.json`, JSON.stringify(o, null, 1) + '\n', 'utf8'); }
    else if (o.att !== a.att) { attChanged.add(it.id); log(`상세 · ${it.id}: 첨부가 바뀜 → 원문 확인`); } }
  const today = nowKst().slice(0, 10), due = i => i.to ? Math.round((Date.parse(i.to) - Date.parse(today)) / 864e5) : 9999, byDue = (a, b) => due(a) - due(b);
  // 첫 모델(하루 예산) 우선순위: 마감 3일 이내 다시 읽기 → 원문(첨부)이 바뀐 공고 교체 → 나머지 다시 읽기 · 새 공고 첫 읽기는 lite (각각 마감 가까운 순)
  const again = items.filter(i => have.has(i.id) && (needs(i.id) || attChanged.has(i.id))).sort(byDue), fresh = items.filter(i => !have.has(i.id)).sort(byDue);
  const soon = again.filter(i => due(i) <= 3), changed = again.filter(i => due(i) > 3 && attChanged.has(i.id)), rest = again.filter(i => due(i) > 3 && !attChanged.has(i.id));
  const todo = [...soon, ...changed, ...rest, ...fresh];
  let made = 0, madeRe = 0, madeNew = 0, stopped = '', skipped = 0; const deferredNow = new Set();   // 한 번에: 첫 모델 다시 읽기 max 개 + lite 새 공고 max 개
  const defer = (it, why) => { skipped++; deferredNow.add(it.id); const f = fail[it.id] ?? {};
    fail[it.id] = { ...f, n: f.n || 0, defer: (f.defer || 0) + 1, deferWhy: why, deferAt: nowKst(), title: it.title || f.title || '', to: it.to || f.to || '' };
    log(`상세 · ${it.id}: 미룸 ${fail[it.id].defer}회째 (${why})`); };
  for (const it of todo) {
    const re = have.has(it.id);
    if (!safeId(it.id) || stopped || (re ? madeRe : madeNew) >= max || (fail[it.id]?.n || 0) >= MAX_TRY || basics.has(it.id)) continue;
    if (re && blocked(MODELS[0])) { defer(it, spent.has(MODELS[0]) ? `${MODELS[0]} 429 사용량 다 참` : `${MODELS[0]} 오늘 예산 다 씀 (${PRIMARY_BUDGET}/${PRIMARY_BUDGET})`); continue; }
    try {
      const p = await findPdf(it); if (!p) { fail[it.id] = { ...fail[it.id], n: MAX_TRY, why: '공고문 PDF 를 찾지 못함' }; log(`상세 · ${it.id}: PDF 없음`); continue; }
      const pdf = await downloadPdf(p), src = sourceHash(pdf, p.text), old = prev.get(it.id);
      if (attChanged.has(it.id) && old?.src === src) {   // 첨부 이름·식별자만 바뀌고 원문은 같음 → AI 없이 첨부 정보만 고침
        await writeFile(`${dir}${it.id}.json`, JSON.stringify({ ...old, att: p.att }, null, 1) + '\n', 'utf8'); log(`상세 · ${it.id}: 첨부 정보만 바뀜 (원문 같음)`); continue; }
      const { data, model } = await askGemini(pdf, p.text, { models: re ? [MODELS[0]] : [MODELS[1]] });
      const neu = fillFromText(cleanDetail(data), p.text); if (!neu) throw new Error('AI 가 조건을 못 읽음');
      // 원문(PDF + 본문) 해시가 같을 때만 칸별 합치기 · 다르면(정정공고 등) 새 결과로 교체 · 예전 파일에 해시가 없으면(src 기록 전) 같은 원문으로 보고 합침 (단, 첨부가 바뀌었으면 다른 원문)
      const same = !!old && (old.src ? old.src === src : !attChanged.has(it.id));
      if (old && !same && model !== MODELS[0]) { defer(it, `원문이 바뀌었지만 ${model} 결과라 교체 안 함 · 다음 갱신에 ${MODELS[0]}`); continue; }   // 교체는 첫 모델로만
      if (old && old.model === MODELS[1] && model === MODELS[0]) {   // lite → 첫 모델 비교 기록
        const c = compareDetail(old, neu); log(`상세 · ${it.id}: lite↔첫 모델 비교 · ${c.text}`);
        await appendFile(`${dir}_compare.jsonl`, JSON.stringify({ at: nowKst(), id: it.id, same, lite: old.readAt || old.read || '', ...c, text: undefined }) + '\n', 'utf8'); }
      const { d, kept } = mergeDetail(same ? { ...Object.fromEntries(LINE_KEYS.map(k => [k, old[k] || null])), ...pickLists(old) } : null, neu);
      await writeFile(`${dir}${it.id}.json`, JSON.stringify({ id: it.id, v: DETAIL_V, read: nowKst().slice(0, 10), readAt: nowKst(), model, src, att: p.att, ...d }, null, 1) + '\n', 'utf8');
      have.add(it.id); delete fail[it.id]; made++; re ? madeRe++ : madeNew++; log(`상세 · ${it.id}: ${re ? '다시 ' : ''}읽음 (${model}${old && !same ? ' · 원문이 바뀌어 새로 교체' : ''}${kept.length ? ` · 예전 값 유지: ${kept.join(', ')}` : ''})`);
    } catch (e) {
      const why = scrubKey(e.message); if (e.skip || e.transient) { defer(it, why); continue; } if (e.stop) { stopped = why; log(`상세 · 멈춤: ${why}`); continue; }
      fail[it.id] = { ...fail[it.id], n: (fail[it.id]?.n || 0) + 1, why }; log(`상세 · ${it.id}: 실패 ${fail[it.id].n}회째 (${why})`);
    }
  }
  if (skipped) log(`상세 · ${skipped}건은 다음 갱신에 (사용량·붐빔)`);
  await writeFile(quotaFile, JSON.stringify(quota, null, 1) + '\n', 'utf8');
  log(`상세 · 첫 모델 오늘 사용 ${quota.used[MODELS[0]] || 0}/${PRIMARY_BUDGET} (태평양 ${day} · lite ${quota.used[MODELS[1]] || 0}번)`);
  for (const id of deferredNow) if (have.has(id)) {   // 상세 파일에도 미룸 횟수 (다시 읽기에 성공하면 새 파일에는 없음)
    const o = await readJson(`${dir}${id}.json`, null); if (o) await writeFile(`${dir}${id}.json`, JSON.stringify({ ...o, defer: { n: fail[id].defer, why: fail[id].deferWhy, at: fail[id].deferAt } }, null, 1) + '\n', 'utf8'); }
  const ids = new Set(items.map(i => i.id)), gone = [];
  for (const id of have) if (!ids.has(id)) { await unlink(`${dir}${id}.json`).catch(() => {}); have.delete(id); }
  for (const id of Object.keys(fail)) if (!ids.has(id)) { if (fail[id].defer > 0) gone.push({ id, ...fail[id] }); delete fail[id]; }
  if (gone.length && deferLog) {   // 미룬 채로 목록에서 빠진 공고(마감 지남) → 인수인계용 기록
    let head = ''; try { await readFile(deferLog); } catch { head = '# 마감까지 상세를 못 읽은 공고 (자동 기록)\n\n`scripts/detail.mjs` 가 공고가 목록에서 빠질 때(마감 지남) 마지막 상태가 \'미룸\'이면 여기에 적는다. 사용량·붐빔·연결 문제로 계속 밀렸다는 뜻.\n\n';
      await mkdir(dirname(deferLog), { recursive: true }); }
    await appendFile(deferLog, head + gone.map(g => `- ${nowKst().slice(0, 10)} \`${g.id}\` ${g.title || ''}${g.to ? ` · 마감 ${g.to}` : ''} · 미룸 ${g.defer}회 · 마지막: ${g.deferWhy || ''} (${g.deferAt || ''})`).join('\n') + '\n', 'utf8');
    log(`상세 · 마감까지 미뤄진 공고 ${gone.length}건 → ${deferLog.split('/').slice(-3).join('/')}`); }
  await writeFile(failFile, JSON.stringify(fail, null, 1) + '\n', 'utf8');
  for (const it of items) { it.detail = have.has(it.id); it.dv = it.detail ? await detailStamp(`${dir}${it.id}.json`) : ''; }
  return { made, madeRe, madeNew, stopped, skipped, have: have.size, use: geminiUse(), today: { day, ...quota.used } };
}
// 원문 해시(src): PDF 내용 + 게시판 본문의 '글 내용' 줄만 (다음글/이전글 뒤는 버리고, 조회수·등록일·목록·인쇄·공유·첨부 같은 주변 줄은 뺀다)
// → 같으면 다시 읽은 결과와 합치고, 다르면 교체
const AROUND = /^(조회\s*수|조회\s*[:：]|등록일|작성일|수정일|목록|인쇄|공유|페이스북|네이버\s*블로그|카카오톡|트위터|첨부|미리보기|바로\s*(보기|듣기)|다운로드|-->|\.\w{2,4}$|\d[\d,]*$)/;
export function contentText(text = '') {
  const ls = String(text).split('\n').map(l => l.trim()), cut = ls.findIndex(l => /^(다음글|이전글)(\s|$)/.test(l));
  return (cut >= 0 ? ls.slice(0, cut) : ls).filter(l => l && !AROUND.test(l)).join('\n');
}
export function sourceHash(pdf, text = '') {
  const t = contentText(text);
  return createHash('sha1').update(pdf).update('\n--본문--\n').update(t).digest('hex').slice(0, 16);
}
// 상세 도장(dv): 파일 내용 해시 앞 10자리 → notices.json 에 넣고 사이트가 ?v= 로 붙여 받는다 (캐시가 예전 상세를 보여 주지 않게)
export async function detailStamp(file) { try { return createHash('sha1').update(await readFile(file)).digest('hex').slice(0, 10); } catch { return ''; } }
// 예전 파일의 목록 칸을 cleanDetail 모양 그대로 (주택형 movein 등 새 칸이 없어도 그대로 둔다)
const pickLists = o => Object.fromEntries(LIST_KEYS.map(k => [k, Array.isArray(o?.[k]) ? o[k] : []]));
