// 공고 상세(신청 조건 요약): 공고문 PDF 를 받아 Gemini 가 읽은 내용을 feed/detail/{id}.json 으로 둔다 (사이트 '상세보기')
// feed.mjs 가 피드를 만든 뒤 부른다. 키는 저장소 Secrets 의 GEMINI_API_KEY (자동 갱신 전용 프로젝트 키) — URL·로그·파일에 남기지 않는다.
// 한 번 읽은 공고는 다시 읽지 않는다 · 한 번에 MAX_NEW 개까지 · 3번 실패한 공고는 그만 · 429(사용량 다 참)면 이번 실행은 멈춘다
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DETAIL_DIR = fileURLToPath(new URL('../feed/detail/', import.meta.url));
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];   // 사이트 AI_MODELS 와 같은 순서
const MAX_NEW = 5, MAX_TRY = 3, MAX_PDF = 15 * 1048576, MAX_TEXT = 6000;
export const DETAIL_V = 5;   // 읽는 방법을 바꾸면 올린다 → 예전 상세는 다시 읽음 (v2: 게시판 본문도 함께 보냄 · v3: 신청 방법·입주 기간·부담 비용·호수 · v4: 문의·신청 페이지를 본문에서 채움 · v5: 비용 예시 · 모델 기록)
const UA = { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)' };

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
  catch (e) { throw new Error(`연결 실패 (${e?.cause?.code || e?.name || 'network'})`); }
  if (!r.ok) throw new Error(`HTTP ${r.status}`); return r;
}
const pick = list => list.find(f => /\.pdf$/i.test(f.name) && /공고/.test(f.name)) || list.find(f => /\.pdf$/i.test(f.name));

// 공고문 PDF 찾기 (출처마다 다르다) → { url, method, body } 또는 null
export function pdfFromYouthView(html, base) {   // 청년안심주택 상세: /coHouse/cmmn/file/fileDown.do 링크
  const list = [...String(html).matchAll(/href="(\/coHouse\/cmmn\/file\/fileDown\.do\?[^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)].map(m => ({ url: abs(base, m[1]), name: m[2].trim() }));
  const f = pick(list); return f ? { url: f.url } : null;
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
export async function findPdf(item) {
  const src = item.id.split('-')[0]; if (!['youth', 'myhome', 'sh'].includes(src)) return null;   // LH 등: 아직 PDF 찾는 법을 모른다 → 상세 없음
  // myhome: addDetails 가 API 기본 정보(basics)로 상세를 만들고 여기는 부르지 않는다 (해외 서버에서 마이홈 상세 페이지가 시간 초과)
  const html = await (await get(item.url)).text(), text = pageText(html, item.title);
  let p = null;
  if (src === 'youth') p = pdfFromYouthView(html, item.url);
  else if (src === 'myhome') p = pdfFromMyHomeView(html);
  else { const f = pick(shFiles(html)); if (f) {
    const r = await get(`https://www.i-sh.co.kr/app/com/util/htmlConverter.do?brd_id=${encodeURIComponent(f.brdId)}&seq=${encodeURIComponent(f.seq)}&data_tp=A&file_seq=${encodeURIComponent(f.fileSeq)}`);
    const url = shPdfFromViewer(r.url); if (url) p = { url }; } }
  return p ? { ...p, text } : null;
}
async function downloadPdf(p) {
  const r = await get(p.url, p.method ? { method: p.method, body: p.body } : {}), buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_PDF) throw new Error(`PDF 가 너무 큼 (${(buf.length / 1048576).toFixed(1)}MB)`);
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF 가 아님');
  return buf;
}

// Gemini 로 읽기: 붐비면(503) 2초 뒤 한 번 더 · 모델 순서대로 · 429 면 그 모델은 이번 실행에서 빼고 다음 모델 (모델마다 무료 사용량이 따로) · 모두 429 면 멈춤
// primaryOnly: 다시 읽기는 첫 모델로만 (lite 로 다시 읽으면 오히려 나빠질 수 있다) → 첫 모델을 못 쓰면 { skip }
const spent = new Set();
export async function askGemini(pdf, text = '', { primaryOnly = false } = {}) {
  const key = geminiKey(); if (!key) throw Object.assign(new Error('GEMINI_API_KEY 없음'), { stop: true });
  const models = primaryOnly ? MODELS.slice(0, 1) : MODELS; if (models.every(x => spent.has(x))) throw Object.assign(new Error(`${models[0]} 사용량 다 참`), primaryOnly ? { skip: true } : { stop: true });
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: DETAIL_PROMPT }, { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } }, ...(text ? [{ text: `게시판 본문:\n${text}` }] : [])] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: DETAIL_SCHEMA } });
  let last = '';
  for (const m of models.filter(x => !spent.has(x))) for (let n = 0; n < 2; n++) {
    let r; try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(120000) }); }
    catch (e) { last = `${m}: 연결 실패`; break; }
    if (r.status === 429) { spent.add(m); last = `${m}: 429 사용량 다 참`; break; }
    if (r.status === 503 && n === 0) { await new Promise(s => setTimeout(s, 2000)); continue; }
    if (!r.ok) { last = `${m}: HTTP ${r.status}`; if (r.status === 400 || r.status === 403) { const t = await r.text(); if (/API_KEY|PERMISSION/.test(t)) throw Object.assign(new Error(`${m}: 키 오류`), { stop: true }); } break; }
    const t = (await r.json())?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    try { return { data: JSON.parse(t), model: m }; } catch { last = `${m}: JSON 아님`; break; }
  }
  if (models.every(x => spent.has(x))) throw Object.assign(new Error(primaryOnly ? `${models[0]} 사용량 다 참` : '모든 모델 429 사용량 다 참'), primaryOnly ? { skip: true } : { stop: true });
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
  const d = { target: s(x?.target), eligibility: arr(x?.eligibility, 8), income: s(x?.income), asset: s(x?.asset), car: s(x?.car),
    supply: objs(x?.supply, ['type', 'area', 'units', 'price', 'movein'], 10), schedule: objs(x?.schedule, ['label', 'date'], 8), apply: s(x?.apply, 200), costs: arr(x?.costs, 6), special: arr(x?.special, 8), contact: s(x?.contact) };
  return d.target || d.eligibility.length ? d : null;
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
export async function addDetails(items, { dir = DETAIL_DIR, max = MAX_NEW, log = console.log, basics = new Map() } = {}) {
  spent.clear();
  await mkdir(dir, { recursive: true });
  const failFile = `${dir}_fail.json`, fail = await readJson(failFile, {}), have = new Set((await readdir(dir)).filter(f => /\.json$/.test(f) && !f.startsWith('_')).map(f => f.slice(0, -5)));
  const prev = new Map(); for (const id of have) prev.set(id, await readJson(`${dir}${id}.json`, {}));
  const needs = id => { const o = prev.get(id); return !o || o.source === 'api' ? false : (o.v || 1) < DETAIL_V || o.model !== MODELS[0]; };
  for (const it of items) { const b = basics.get(it.id); if (!b || !safeId(it.id)) continue;   // API 기본 정보 → 매번 새로 씀 (AI 안 씀)
    await writeFile(`${dir}${it.id}.json`, JSON.stringify({ id: it.id, v: DETAIL_V, source: 'api', read: nowKst().slice(0, 10), readAt: nowKst(), model: null, ...b }, null, 1) + '\n', 'utf8');
    have.add(it.id); prev.set(it.id, { source: 'api' }); delete fail[it.id]; }
  const todo = [...items.filter(i => !have.has(i.id)), ...items.filter(i => have.has(i.id) && needs(i.id))];
  let made = 0, stopped = '', skipped = 0;
  for (const it of todo) {
    if (!safeId(it.id) || stopped || made >= max || (fail[it.id]?.n || 0) >= MAX_TRY || basics.has(it.id)) continue;
    const again = have.has(it.id);
    if (again && spent.has(MODELS[0])) { skipped++; continue; }
    try {
      const p = await findPdf(it); if (!p) { fail[it.id] = { n: MAX_TRY, why: '공고문 PDF 를 찾지 못함' }; log(`상세 · ${it.id}: PDF 없음`); continue; }
      const { data, model } = await askGemini(await downloadPdf(p), p.text, { primaryOnly: again });
      const neu = fillFromText(cleanDetail(data), p.text); if (!neu) throw new Error('AI 가 조건을 못 읽음');
      const old = prev.get(it.id), { d, kept } = mergeDetail(old ? { ...Object.fromEntries(LINE_KEYS.map(k => [k, old[k] || null])), ...pickLists(old) } : null, neu);
      await writeFile(`${dir}${it.id}.json`, JSON.stringify({ id: it.id, v: DETAIL_V, read: nowKst().slice(0, 10), readAt: nowKst(), model, ...d }, null, 1) + '\n', 'utf8');
      have.add(it.id); delete fail[it.id]; made++; log(`상세 · ${it.id}: ${again ? '다시 ' : ''}읽음 (${model}${kept.length ? ` · 예전 값 유지: ${kept.join(', ')}` : ''})`);
    } catch (e) {
      const why = scrubKey(e.message); if (e.skip) { skipped++; continue; } if (e.stop) { stopped = why; log(`상세 · 멈춤: ${why}`); continue; }
      fail[it.id] = { n: (fail[it.id]?.n || 0) + 1, why }; log(`상세 · ${it.id}: 실패 (${why})`);
    }
  }
  if (skipped) log(`상세 · 다시 읽기 ${skipped}건은 ${MODELS[0]} 사용량이 없어 다음에`);
  const ids = new Set(items.map(i => i.id));
  for (const id of have) if (!ids.has(id)) { await unlink(`${dir}${id}.json`).catch(() => {}); have.delete(id); }
  for (const id of Object.keys(fail)) if (!ids.has(id)) delete fail[id];
  await writeFile(failFile, JSON.stringify(fail, null, 1) + '\n', 'utf8');
  for (const it of items) it.detail = have.has(it.id);
  return { made, stopped, skipped, have: have.size };
}
// 예전 파일의 목록 칸을 cleanDetail 모양 그대로 (주택형 movein 등 새 칸이 없어도 그대로 둔다)
const pickLists = o => Object.fromEntries(LIST_KEYS.map(k => [k, Array.isArray(o?.[k]) ? o[k] : []]));
