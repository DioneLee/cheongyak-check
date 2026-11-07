// 공고 상세 읽기 검사 (인터넷·진짜 키 없이 가짜 응답으로): node scripts/verify/detail_check.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GEMINI_API_KEY = 'TESTGEMINIKEY-only'; process.env.DETAIL_RETRY_MS = '20';   // 503 뒤 기다림 (실제 30초)
const D = await import('../detail.mjs');
let ok = 0; const t = async (name, fn) => { await fn(); ok++; console.log('OK', name); };
const PDF = Buffer.from('%PDF-1.4 가짜'), calls = [];
let gem = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ target: '  만 19~39세   청년 ', eligibility: ['무주택', '', '서울 거주'], income: '120% 이하', supply: [{ type: '16A', price: '3000/45' }, {}], schedule: [], special: ['한부모 가점'], contact: null }) }] } }] }));
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url); calls.push({ u, o });
  if (u.hostname === 'generativelanguage.googleapis.com') return gem(u, o);
  if (u.hostname === 'soco.seoul.go.kr' && u.pathname.endsWith('view.do')) return new Response(`<a href="/coHouse/cmmn/file/fileDown.do?atchFileId=aa&amp;fileSn=2">배치도.jpg</a><a href="/coHouse/cmmn/file/fileDown.do?atchFileId=aa&amp;fileSn=1" >청년안심주택 모집공고문.pdf</a>`);
  if (u.hostname === 'www.i-sh.co.kr' && u.pathname.endsWith('view.do')) return new Response(`initParam.downList = [{"brdId":"GS0401","seq":"9","fileSeq":"1","oriFileNm":"신청서.hwp"},{"brdId":"GS0401","seq":"9","fileSeq":"2","oriFileNm":"입주자 모집 공고문.pdf"}];`);
  if (u.pathname.endsWith('htmlConverter.do')) { const r = new Response('<html>'); Object.defineProperty(r, 'url', { value: 'https://www.i-sh.co.kr/app/skin/doc.html?fn=2026_abc&rs=/app/upload/bbs/GS0401/2026/10/html/' }); return r; }
  if (u.hostname === 'www.myhome.go.kr' && u.pathname.includes('DetailView')) return new Response(`<a href="javascript:fnDownFile('1a18', '1')" >\n (영등포)행복주택 모집 공고문.pdf</a>`);
  return new Response(PDF);
};
await t('PDF 찾기: 청년안심주택 · 공고문 PDF 를 고름', async () => assert.equal((await D.findPdf({ id: 'youth-1', title: 'x', url: 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=1' })).url, 'https://soco.seoul.go.kr/coHouse/cmmn/file/fileDown.do?atchFileId=aa&fileSn=1'));
await t('PDF 찾기: SH 미리보기 주소 → 원본 PDF', async () => { assert.equal((await D.findPdf({ id: 'sh-9', title: 'x', url: 'https://www.i-sh.co.kr/app/x/view.do?seq=9' })).url, 'https://www.i-sh.co.kr/app/upload/bbs/GS0401/2026/10/2026_abc.pdf');
  assert.ok(calls.some(c => c.u.pathname.endsWith('htmlConverter.do') && c.u.searchParams.get('file_seq') === '2')); });
await t('PDF 찾기: 마이홈 공고문 → POST 다운로드', async () => { const p = await D.findPdf({ id: 'myhome-1', url: 'https://www.myhome.go.kr/hws/portal/sch/selectRsdtRcritNtcDetailView.do?pblancId=1' });
  assert.equal(p.method, 'POST'); assert.equal(String(p.body), 'atchFileId=1a18&fileSn=1'); });
await t('PDF 찾기: LH 는 아직 없음', async () => assert.equal(await D.findPdf({ id: 'lh-1', url: 'https://apply.lh.or.kr' }), null));
await t('게시판 본문: 제목부터 다음글 앞까지 · 태그 뺌', async () => { const x = D.pageText('<div>메뉴</div><h3>[민간임대] 개봉역 세이지움 공고</h3><p>청약신청 : 11. 9. ~ 11. 10.</p><p>문의 02-1234-5678</p><div>다음글 [민간임대] 다른 공고</div>', '[민간임대] 개봉역 세이지움 공고');
  assert.equal(x, '개봉역 세이지움 공고\n청약신청 : 11. 9. ~ 11. 10.\n문의 02-1234-5678'); });
await t('AI 가 비운 문의·신청 페이지는 본문 줄에서 채움 (AI 값이 있으면 그대로)', async () => {
  const txt = '[청약신청]\n■ 청약신청 페이지 : https://naver.me/GUTJuhOO\n■ 문의전화 : 02-6239-0330\n■ 운영시간 : 월~금 10:00~17:00';
  assert.deepEqual(D.fillFromText({ contact: null, apply: null }, txt), { contact: '02-6239-0330', apply: '인터넷 신청: https://naver.me/GUTJuhOO' });
  assert.deepEqual(D.fillFromText({ contact: 'AI 값', apply: null }, '문의 없음'), { contact: 'AI 값', apply: null }); });
await t('결과 다듬기: 빈 값 빼고 공백 정리', async () => { const d = D.cleanDetail({ target: ' a  b ', eligibility: ['x', '', 3], supply: [{}, { type: 'A' }] });
  assert.equal(d.target, 'a b'); assert.deepEqual(d.eligibility, ['x']); assert.deepEqual(d.supply, [{ type: 'A', area: null, units: null, price: null, movein: null }]); assert.equal(d.apply, null); assert.deepEqual(d.costs, []); assert.equal(D.cleanDetail({ eligibility: [] }), null); });

await t('퇴보 막기: 목록은 더 많은 쪽 · 한 줄 칸은 새 값이 비면 예전 값', async () => {
  const old = { target: '예전', eligibility: ['a', 'b', 'c', 'd', 'e'], special: ['1', '2', '3', '4', '5', '6', '7'], supply: [{ type: 'A' }], schedule: [], costs: [], contact: '02-1', apply: null };
  const { d, kept } = D.mergeDetail(old, { target: '새로', eligibility: ['a', 'b', 'c'], special: [], supply: [{ type: 'A' }, { type: 'B' }], schedule: [{ label: '접수' }], costs: ['x'], contact: null, apply: '링크' });
  assert.equal(d.special.length, 7); assert.equal(d.eligibility.length, 5); assert.equal(d.supply.length, 2); assert.equal(d.schedule.length, 1);
  assert.equal(d.target, '새로'); assert.equal(d.contact, '02-1'); assert.equal(d.apply, '링크'); assert.deepEqual(kept.sort(), ['contact', 'eligibility', 'special']); });

const J = o => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }));
const FULL = { target: '청년', eligibility: ['무주택', '', '서울 거주'], income: '120% 이하', supply: [{ type: '16A', price: '3000/45' }, {}], schedule: [], special: ['한부모 가점'], contact: null };
const gcalls = () => calls.filter(c => c.u.hostname === 'generativelanguage.googleapis.com'), mdl = c => c.u.pathname.includes('flash-lite') ? 'lite' : 'flash';
const yi = n => ({ id: `youth-${n}`, title: 'x', url: `https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${n}` });
const dir = await mkdtemp(join(tmpdir(), 'det-')) + '/', log = [], rd = async id => JSON.parse(await readFile(dir + id + '.json', 'utf8'));
const items = [1, 2, 3, 4, 5, 6, 7].map(yi).concat([{ id: 'lh-1', url: 'https://apply.lh.or.kr' }]);
await writeFile(dir + 'youth-old.json', '{}');   // 피드에서 빠진 공고
gem = () => J(FULL); calls.length = 0; let r = await D.addDetails(items, { dir, max: 5, log: m => log.push(m) });
await t('한 번에 5개까지만 · 파일로 저장 · detail 표시 · 모델 이름과 시각 기록', async () => { assert.equal(r.made, 5); assert.deepEqual(items.map(i => i.detail), [true, true, true, true, true, false, false, false]);
  const d = await rd('youth-1'); assert.equal(d.target, '청년'); assert.deepEqual(d.eligibility, ['무주택', '서울 거주']); assert.equal(d.model, 'gemini-3.6-flash'); assert.match(d.readAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/); assert.equal(d.v, D.DETAIL_V); });
await t('피드에서 빠진 공고 상세는 지움', async () => assert.ok(!(await readdir(dir)).includes('youth-old.json')));
await t('키는 헤더로만 · 로그에 없음 · 본문 글도 함께 보냄', async () => { const g = gcalls();
  assert.ok(JSON.parse(g[0].o.body).contents[0].parts.some(p => /^게시판 본문:/.test(p.text || '')));
  assert.ok(g.length === 5 && g.every(c => c.o.headers['x-goog-api-key'] === 'TESTGEMINIKEY-only' && !c.u.search)); assert.ok(!log.join(' ').includes('TESTGEMINI')); });
calls.length = 0; r = await D.addDetails(items, { dir, max: 5, log: () => {} });
await t('첫 모델로 읽은 공고는 다시 안 읽음 · LH 는 PDF 없음으로 끝', async () => { assert.equal(r.made, 2); assert.equal(gcalls().length, 2);
  assert.equal(JSON.parse(await readFile(dir + '_fail.json', 'utf8'))['lh-1'].n, 3); });

// 첫 모델 429 → 새 공고는 lite 로 첫 읽기 · 다시 읽기는 건너뜀
const more = [8, 9, 10].map(yi);
await writeFile(dir + 'youth-1.json', JSON.stringify({ id: 'youth-1', v: 4, target: '예전 v4', eligibility: ['a'], special: ['1', '2', '3', '4', '5', '6', '7'] }));   // 예전 방법 → 다시 읽을 대상
gem = u => u.pathname.includes('3.6-flash') ? new Response('{}', { status: 429 }) : J({ ...FULL, target: 'lite' }); calls.length = 0;
r = await D.addDetails([...items, ...more], { dir, log: () => {} });
await t('첫 모델 429 → 새 공고만 lite 로 읽음 · 다시 읽기는 미룸(실패로 안 셈) · 429 모델은 다시 안 부름', async () => {
  assert.equal(r.made, 3); assert.equal(r.skipped, 1); assert.equal((await rd('youth-8')).model, 'gemini-3.5-flash-lite'); assert.equal((await rd('youth-1')).target, '예전 v4');
  assert.equal(gcalls().filter(c => mdl(c) === 'flash').length, 1); assert.ok(!JSON.parse(await readFile(dir + '_fail.json', 'utf8'))['youth-1']); });
// 다음 실행: 첫 모델 사용량 있음 → lite 가 읽은 것·예전 방법은 첫 모델로 다시 읽음 · 특이사항 0개가 와도 예전 7개 유지
gem = () => J({ ...FULL, target: '다시 읽음', special: [] }); calls.length = 0;
r = await D.addDetails([...items, ...more], { dir, log: () => {} });
await t('lite·예전 방법으로 읽은 건 다음 갱신 때 첫 모델로 다시 읽음', async () => { assert.equal(r.made, 4); assert.ok(gcalls().every(c => mdl(c) === 'flash'));
  for (const id of ['youth-1', 'youth-8', 'youth-9', 'youth-10']) assert.equal((await rd(id)).model, 'gemini-3.6-flash'); });
await t('특이사항 7개 있던 상세에 0개짜리 새 결과 → 7개 유지 (자격은 더 많은 새 값)', async () => { const d = await rd('youth-1');
  assert.equal(d.target, '다시 읽음'); assert.equal(d.special.length, 7); assert.deepEqual(d.eligibility, ['무주택', '서울 거주']); });
// 다시 읽기를 첫 모델로만: 다음 실행에서 첫 모델 429 + 다시 읽을 것만 있으면 lite 를 안 부름
await writeFile(dir + 'youth-2.json', JSON.stringify({ id: 'youth-2', v: D.DETAIL_V, model: 'gemini-3.5-flash-lite', target: 'lite 가 읽음', eligibility: ['x'] }));
gem = u => u.pathname.includes('3.6-flash') ? new Response('{}', { status: 429 }) : J(FULL); calls.length = 0;
r = await D.addDetails([...items, ...more], { dir, log: () => {} });
await t('다시 읽기는 첫 모델로만 (429 면 lite 로 다시 읽지 않음)', async () => { assert.equal(r.made, 0); assert.equal(r.skipped, 1); assert.ok(gcalls().every(c => mdl(c) === 'flash')); assert.equal((await rd('youth-2')).target, 'lite 가 읽음'); });

let n503 = 0; gem = () => (++n503 === 1 ? new Response('{}', { status: 503 }) : J({ target: '청년', eligibility: [] }));
r = await D.addDetails([...items, ...more, yi(11)], { dir, log: () => {} });
await t('503(붐빔) → 잠시 뒤 한 번 더 → 읽음', async () => { assert.ok(n503 >= 2); assert.equal((await rd('youth-11')).target, '청년'); });
gem = () => new Response('{}', { status: 503 }); calls.length = 0; r = await D.addDetails([yi(12)], { dir, log: () => {} });
await t('모델 둘 다 503 두 번 → 미룸 (실패로 안 셈 · 다음 모델까지 시도)', async () => { const g = gcalls(); assert.equal(g.length, 4); assert.deepEqual(g.map(mdl), ['flash', 'flash', 'lite', 'lite']);
  assert.equal(r.skipped, 1); assert.ok(!JSON.parse(await readFile(dir + '_fail.json', 'utf8'))['youth-12']); });
gem = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '조건을 못 찾았어요' }] } }] }));
const bad = [yi(99)]; for (let k = 0; k < 4; k++) await D.addDetails(bad, { dir, log: () => {} });
await t('3번 실패한 공고는 그만 읽음', async () => { const f = JSON.parse(await readFile(dir + '_fail.json', 'utf8')); assert.equal(f['youth-99'].n, 3); });

// 마이홈포털: API 기본 정보로 상세 (AI·PDF 안 씀)
calls.length = 0; const mh = [{ id: 'myhome-21471', url: 'https://www.myhome.go.kr/x' }];
r = await D.addDetails(mh, { dir, log: () => {}, basics: new Map([['myhome-21471', { target: null, eligibility: [], supply: [{ type: '나라키움', price: '보증금 4,650만원 · 월 22.5만원' }], schedule: [], contact: '02-6265-0620', addr: '서울 영등포구' }]]) });
await t('마이홈포털: API 기본 정보로 상세 (source api · AI·상세 페이지 안 부름)', async () => { const d = await rd('myhome-21471');
  assert.equal(d.source, 'api'); assert.equal(d.model, null); assert.equal(d.contact, '02-6265-0620'); assert.equal(mh[0].detail, true); assert.equal(calls.length, 0); });
// 원문 해시(src): 같으면 합치고, 다르면(정정공고) 교체
await t('원문 해시: 조회수 줄은 빼고 · PDF 나 본문이 바뀌면 달라짐', async () => {
  assert.equal(D.sourceHash(PDF, '제목\n조회수 : 5,269\n본문'), D.sourceHash(PDF, '제목\n조회수 : 9,999\n본문'));
  assert.notEqual(D.sourceHash(PDF, '본문'), D.sourceHash(Buffer.from('%PDF-1.4 정정'), '본문')); assert.notEqual(D.sourceHash(PDF, '본문'), D.sourceHash(PDF, '본문 정정')); });
{ const sd = await mkdtemp(join(tmpdir(), 'src-')) + '/', it = [yi(31)];
  gem = () => J({ ...FULL, schedule: [{ label: '청약', date: '11.9' }] }); await D.addDetails(it, { dir: sd, log: () => {} });
  const first = JSON.parse(await readFile(sd + 'youth-31.json', 'utf8'));
  await t('읽으면 원문 해시(src) 저장 · 세대 수 숫자만 오면 n세대', async () => { assert.match(first.src, /^[0-9a-f]{16}$/);
    assert.deepEqual(D.cleanDetail({ target: 'a', supply: [{ type: 'A', units: '1' }, { type: 'B', units: '총 3세대' }] }).supply.map(x => x.units), ['1세대', '총 3세대']); });
  const OLD = { ...first, model: 'gemini-3.5-flash-lite', schedule: [{ label: '옛 일정1', date: '10.1' }, { label: '옛 일정2', date: '10.2' }, { label: '옛 일정3', date: '10.3' }], special: ['옛 특이1', '옛 특이2', '옛 특이3'] };
  await writeFile(sd + 'youth-31.json', JSON.stringify(OLD)); await D.addDetails(it, { dir: sd, log: () => {} });
  await t('원문 해시가 같으면 칸별 합치기 (옛 일정 3개 유지)', async () => { const d = JSON.parse(await readFile(sd + 'youth-31.json', 'utf8')); assert.equal(d.schedule[0].label, '옛 일정1'); assert.equal(d.special.length, 3); });
  await writeFile(sd + 'youth-31.json', JSON.stringify({ ...OLD, src: '0000000000000000' })); const lg = []; await D.addDetails(it, { dir: sd, log: m => lg.push(m) });
  await t('원문 해시가 다르면(정정공고) 합치지 않고 새 결과로 교체 — 옛 일정·특이사항이 남지 않음', async () => { const d = JSON.parse(await readFile(sd + 'youth-31.json', 'utf8'));
    assert.deepEqual(d.schedule, [{ label: '청약', date: '11.9' }]); assert.deepEqual(d.special, ['한부모 가점']); assert.equal(d.src, first.src); assert.ok(lg.some(m => m.includes('원문이 바뀌어 새로 교체'))); });
  await rm(sd, { recursive: true }); }
// 읽는 순서: 마감 3일 이내 다시 읽기 → 새 공고 → 나머지 다시 읽기 (각각 마감 가까운 순)
const od = await mkdtemp(join(tmpdir(), 'ord-')) + '/', T = n => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
for (const [n] of [[21], [22], [23]]) await writeFile(od + `youth-${n}.json`, JSON.stringify({ id: `youth-${n}`, v: D.DETAIL_V, model: 'gemini-3.5-flash-lite', target: 'lite', eligibility: ['x'] }));
const oi = [{ ...yi(21), to: T(10) }, { ...yi(22), to: T(2) }, { ...yi(23), to: T(1) }, { ...yi(24), to: T(5) }, { ...yi(25), to: T(0) }, { ...yi(26), to: '' }];
gem = () => J(FULL); calls.length = 0; const seenIds = []; r = await D.addDetails(oi, { dir: od, max: 4, log: m => { const x = m.match(/youth-\d+/); if (x && /읽음/.test(m)) seenIds.push(x[0]); } });
await t('읽는 순서: 마감 3일 이내 다시 읽기(23·22) → 새 공고(25·24) · 한 번에 4개면 나머지(21 다시 읽기·26)는 다음에', async () => assert.deepEqual(seenIds, ['youth-23', 'youth-22', 'youth-25', 'youth-24']));
await t('상세 도장(dv): 상세가 있으면 내용 해시 · 내용이 바뀌면 도장도 바뀜', async () => { const a = oi.find(i => i.id === 'youth-23'); assert.match(a.dv, /^[0-9a-f]{10}$/); assert.equal(oi.find(i => i.id === 'youth-26').dv, '');
  await writeFile(od + 'youth-23.json', '{"id":"youth-23","target":"바뀜"}'); assert.notEqual(await D.detailStamp(od + 'youth-23.json'), a.dv); });
await rm(od, { recursive: true });
await rm(dir, { recursive: true });
console.log(`${ok}개 모두 OK`);
