// 공고 상세 읽기 검사 (인터넷·진짜 키 없이 가짜 응답으로): node scripts/verify/detail_check.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GEMINI_API_KEY = 'TESTGEMINIKEY-only';
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

const dir = await mkdtemp(join(tmpdir(), 'det-')) + '/', log = [];
const items = [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: `youth-${n}`, url: `https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${n}` })).concat([{ id: 'lh-1', url: 'https://apply.lh.or.kr' }]);
await writeFile(dir + 'youth-old.json', '{}');   // 피드에서 빠진 공고
calls.length = 0; let r = await D.addDetails(items, { dir, max: 5, log: m => log.push(m) });
await t('한 번에 5개까지만 읽음 · 파일로 저장 · detail 표시', async () => { assert.equal(r.made, 5); assert.deepEqual(items.map(i => i.detail), [true, true, true, true, true, false, false, false]);
  const d = JSON.parse(await readFile(dir + 'youth-1.json', 'utf8')); assert.equal(d.target, '만 19~39세 청년'); assert.deepEqual(d.eligibility, ['무주택', '서울 거주']); assert.match(d.read, /^\d{4}-\d{2}-\d{2}$/); });
await t('피드에서 빠진 공고 상세는 지움', async () => assert.ok(!(await readdir(dir)).includes('youth-old.json')));
await t('키는 헤더로만 · 로그에 없음 · 본문 글도 함께 보냄', async () => { const g = calls.filter(c => c.u.hostname === 'generativelanguage.googleapis.com');
  assert.ok(JSON.parse(g[0].o.body).contents[0].parts.some(p => /^게시판 본문:/.test(p.text || '')));
  assert.ok(g.length === 5 && g.every(c => c.o.headers['x-goog-api-key'] === 'TESTGEMINIKEY-only' && !c.u.search)); assert.ok(!log.join(' ').includes('TESTGEMINI')); });
calls.length = 0; r = await D.addDetails(items, { dir, max: 5, log: () => {} });
await t('이미 읽은 공고는 다시 안 읽음 · LH 는 PDF 없음으로 끝', async () => { assert.equal(r.made, 2); assert.equal(calls.filter(c => c.u.hostname === 'generativelanguage.googleapis.com').length, 2);
  const f = JSON.parse(await readFile(dir + '_fail.json', 'utf8')); assert.equal(f['lh-1'].n, 3); });
const more = [8, 9, 10].map(n => ({ id: `youth-${n}`, url: `https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${n}` }));
gem = () => new Response('{}', { status: 429 }); calls.length = 0; r = await D.addDetails([...items, ...more], { dir, log: () => {} });
await t('429(사용량 다 참) → 다음 모델도 429 면 이번 실행 멈춤 · 실패로 세지 않음', async () => { assert.match(r.stopped, /429/); const g = calls.filter(c => c.u.hostname === 'generativelanguage.googleapis.com');
  assert.equal(g.length, 2); assert.ok(g[0].u.pathname.includes('3.6-flash') && g[1].u.pathname.includes('flash-lite'));
  const f = JSON.parse(await readFile(dir + '_fail.json', 'utf8')); assert.ok(!f['youth-8']); });
gem = u => u.pathname.includes('3.6-flash') ? new Response('{}', { status: 429 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"target":"lite","eligibility":[]}' }] } }] }));
calls.length = 0; r = await D.addDetails([...items, ...more], { dir, max: 2, log: () => {} });
await t('첫 모델이 429 면 다음 모델로 읽음 · 429 모델은 그 실행에서 다시 안 부름', async () => { assert.equal(r.made, 2); assert.equal(r.stopped, '');
  const g = calls.filter(c => c.u.hostname === 'generativelanguage.googleapis.com'); assert.equal(g.filter(c => c.u.pathname.includes('3.6-flash')).length, 1); });
let n503 = 0; gem = () => (++n503 === 1 ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"target":"청년","eligibility":[]}' }] } }] })));
r = await D.addDetails([...items, ...more], { dir, log: () => {} });
await t('503(붐빔) → 2초 뒤 한 번 더', async () => { assert.equal(n503, 2); assert.equal(r.made, 1); });
gem = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '조건을 못 찾았어요' }] } }] }));
const bad = [{ id: 'youth-99', url: 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=99' }];
for (let k = 0; k < 4; k++) await D.addDetails(bad, { dir, log: () => {} });
await t('3번 실패한 공고는 그만 읽음', async () => { const f = JSON.parse(await readFile(dir + '_fail.json', 'utf8')); assert.equal(f['youth-99'].n, 3); });
await writeFile(dir + 'youth-1.json', JSON.stringify({ id: 'youth-1', target: '예전' })); gem = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"target":"새로","eligibility":[]}' }] } }] }));
await writeFile(dir + 'youth-2.json', JSON.stringify({ id: 'youth-2', v: D.DETAIL_V, target: '지금' }));
r = await D.addDetails(items.slice(0, 2), { dir, log: () => {} });
await t('예전 방법(v1)으로 읽은 상세는 다시 읽음', async () => { assert.equal(r.made, 1); const d = JSON.parse(await readFile(dir + 'youth-1.json', 'utf8')); assert.equal(d.target, '새로'); assert.equal(d.v, D.DETAIL_V); });
await rm(dir, { recursive: true });
console.log(`${ok}개 모두 OK`);
