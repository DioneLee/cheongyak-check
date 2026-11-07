// 공고 상세(신청 조건 요약): 공고문 PDF 를 받아 Gemini 가 읽은 내용을 feed/detail/{id}.json 으로 둔다 (사이트 '상세보기')
// feed.mjs 가 피드를 만든 뒤 부른다. 키는 저장소 Secrets 의 GEMINI_API_KEY (자동 갱신 전용 프로젝트 키) — URL·로그·파일에 남기지 않는다.
// 한 번 읽은 공고는 다시 읽지 않는다 · 한 번에 MAX_NEW 개까지 · 3번 실패한 공고는 그만 · 429(사용량 다 참)면 이번 실행은 멈춘다
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DETAIL_DIR = fileURLToPath(new URL('../feed/detail/', import.meta.url));
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];   // 사이트 AI_MODELS 와 같은 순서
const MAX_NEW = 5, MAX_TRY = 3, MAX_PDF = 15 * 1048576;
const UA = { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)' };

export const DETAIL_PROMPT = `첨부한 주택 입주자 모집공고문을 읽고, 신청하려는 사람이 알아야 할 조건만 아래 형식의 JSON 하나로 정리해줘. 설명 문장 없이 JSON만.
- 공고문에 적힌 내용만 쓴다. 없으면 null 이나 빈 배열. 짐작하거나 지어내지 마.
- 문장은 짧고 쉬운 말로 (한 항목 80자 이내). 금액·날짜는 공고문 표기 그대로 단위까지.
- target: 누가 신청할 수 있는지 한 줄 (예: '만 19~39세 무주택 미혼 청년').
- eligibility: 신청 자격 조건 목록 (나이·혼인·무주택·거주지·청약통장 등), 최대 8개.
- income, asset, car: 소득·총자산·자동차 기준 한 줄씩 (예: '전년도 도시근로자 월평균소득 100% 이하').
- supply: 주택형(또는 단지)마다 type, area(전용면적), units(모집 세대), price(보증금·월임대료 또는 분양가), 최대 10개.
- schedule: 접수·서류 제출·발표·계약 일정 (label, date).
- special: 가점·우선순위·특이사항과 주의할 점 (한부모·다자녀·세대 분리·부모 소득 합산·거주 기간 등이 있으면 꼭), 최대 8개.
- contact: 문의처 한 줄.`;
const S = { type: 'STRING', nullable: true }, SA = { type: 'ARRAY', items: { type: 'STRING' } };
export const DETAIL_SCHEMA = { type: 'OBJECT', required: ['target', 'eligibility'], properties: {
  target: S, eligibility: SA, income: S, asset: S, car: S,
  supply: { type: 'ARRAY', items: { type: 'OBJECT', properties: { type: S, area: S, units: S, price: S } } },
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
export async function findPdf(item) {
  const src = item.id.split('-')[0];
  if (src === 'youth') return pdfFromYouthView(await (await get(item.url)).text(), item.url);
  if (src === 'myhome') return pdfFromMyHomeView(await (await get(item.url)).text());
  if (src === 'sh') {
    const f = pick(shFiles(await (await get(item.url)).text())); if (!f) return null;
    const r = await get(`https://www.i-sh.co.kr/app/com/util/htmlConverter.do?brd_id=${encodeURIComponent(f.brdId)}&seq=${encodeURIComponent(f.seq)}&data_tp=A&file_seq=${encodeURIComponent(f.fileSeq)}`);
    const url = shPdfFromViewer(r.url); return url ? { url } : null;
  }
  return null;   // LH 등: 아직 PDF 찾는 법을 모른다 → 상세 없음
}
async function downloadPdf(p) {
  const r = await get(p.url, p.method ? { method: p.method, body: p.body } : {}), buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_PDF) throw new Error(`PDF 가 너무 큼 (${(buf.length / 1048576).toFixed(1)}MB)`);
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF 가 아님');
  return buf;
}

// Gemini 로 읽기: 붐비면(503) 2초 뒤 한 번 더 · 모델 순서대로 · 429 는 그대로 위로 (이번 실행 멈춤)
export async function askGemini(pdf) {
  const key = geminiKey(); if (!key) throw Object.assign(new Error('GEMINI_API_KEY 없음'), { stop: true });
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: DETAIL_PROMPT }, { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: DETAIL_SCHEMA } });
  let last = '';
  for (const m of MODELS) for (let n = 0; n < 2; n++) {
    let r; try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(120000) }); }
    catch (e) { last = `${m}: 연결 실패`; break; }
    if (r.status === 429) throw Object.assign(new Error(`${m}: 429 사용량 다 참`), { stop: true });
    if (r.status === 503 && n === 0) { await new Promise(s => setTimeout(s, 2000)); continue; }
    if (!r.ok) { last = `${m}: HTTP ${r.status}`; if (r.status === 400 || r.status === 403) { const t = await r.text(); if (/API_KEY|PERMISSION/.test(t)) throw Object.assign(new Error(`${m}: 키 오류`), { stop: true }); } break; }
    const t = (await r.json())?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    try { return JSON.parse(t); } catch { last = `${m}: JSON 아님`; break; }
  }
  throw new Error(last || 'Gemini 실패');
}

// AI 결과 다듬기: 글자 수·개수 자르기 · 빈 값 빼기 (사이트는 이 모양만 믿는다)
export function cleanDetail(x) {
  const s = (v, n = 160) => typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null;
  const arr = (v, n) => (Array.isArray(v) ? v : []).map(t => s(t)).filter(Boolean).slice(0, n);
  const objs = (v, keys, n) => (Array.isArray(v) ? v : []).map(o => Object.fromEntries(keys.map(k => [k, s(o?.[k], 80)]))).filter(o => keys.some(k => o[k])).slice(0, n);
  const d = { target: s(x?.target), eligibility: arr(x?.eligibility, 8), income: s(x?.income), asset: s(x?.asset), car: s(x?.car),
    supply: objs(x?.supply, ['type', 'area', 'units', 'price'], 10), schedule: objs(x?.schedule, ['label', 'date'], 8), special: arr(x?.special, 8), contact: s(x?.contact) };
  return d.target || d.eligibility.length ? d : null;
}

const readJson = async (f, d) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return d; } };
const safeId = id => /^[a-z]+-[\w-]{1,60}$/.test(id);

// items 마다 상세가 있으면 detail: true. 새 공고는 MAX_NEW 개까지 읽는다. 피드에서 빠진 공고의 상세는 지운다
export async function addDetails(items, { dir = DETAIL_DIR, max = MAX_NEW, log = console.log } = {}) {
  await mkdir(dir, { recursive: true });
  const failFile = `${dir}_fail.json`, fail = await readJson(failFile, {}), have = new Set((await readdir(dir)).filter(f => /\.json$/.test(f) && !f.startsWith('_')).map(f => f.slice(0, -5)));
  let made = 0, stopped = '';
  for (const it of items) {
    if (!safeId(it.id) || have.has(it.id) || stopped || made >= max || (fail[it.id]?.n || 0) >= MAX_TRY) continue;
    try {
      const p = await findPdf(it); if (!p) { fail[it.id] = { n: MAX_TRY, why: '공고문 PDF 를 찾지 못함' }; log(`상세 · ${it.id}: PDF 없음`); continue; }
      const d = cleanDetail(await askGemini(await downloadPdf(p))); if (!d) throw new Error('AI 가 조건을 못 읽음');
      await writeFile(`${dir}${it.id}.json`, JSON.stringify({ id: it.id, read: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), ...d }, null, 1) + '\n', 'utf8');
      have.add(it.id); delete fail[it.id]; made++; log(`상세 · ${it.id}: 읽음`);
    } catch (e) {
      const why = scrubKey(e.message); if (e.stop) { stopped = why; log(`상세 · 멈춤: ${why}`); continue; }
      fail[it.id] = { n: (fail[it.id]?.n || 0) + 1, why }; log(`상세 · ${it.id}: 실패 (${why})`);
    }
  }
  const ids = new Set(items.map(i => i.id));
  for (const id of have) if (!ids.has(id)) { await unlink(`${dir}${id}.json`).catch(() => {}); have.delete(id); }
  for (const id of Object.keys(fail)) if (!ids.has(id)) delete fail[id];
  await writeFile(failFile, JSON.stringify(fail, null, 1) + '\n', 'utf8');
  for (const it of items) it.detail = have.has(it.id);
  return { made, stopped, have: have.size };
}
