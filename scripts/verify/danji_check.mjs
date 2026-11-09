// 단지 직접 공고(엘리스) · 단지 정보(서울시) 수집 검사 — 인터넷 없이 가짜 응답: node scripts/verify/danji_check.mjs
import assert from 'node:assert/strict';
process.env.SCRAPE_GAP_MS = '60';
const E = await import('../sources/elyes.mjs'), D = await import('../danji.mjs'), F = await import('../feed.mjs');
let ok = 0; const t = async (name, fn) => { await fn(); ok++; console.log('OK', name); };

// ---------- 접수일 읽기 ----------
const td = E.titleDates;
await t('접수일: 연도 없는 11/6~11/8 → 게시일 연도', () => assert.deepEqual(td('[어바니엘 염창] 공실세대 모집공고 (접수기간: 11/6~11/8)', '2026-11-06'), { from: '2026-11-06', to: '2026-11-08', time: '' }));
await t('접수일: 연말·연초 12/30~1/2 → 끝은 다음 해', () => assert.deepEqual(td('[어바니엘 가산] 모집공고 (접수기간: 12/30~1/2)', '2026-12-28'), { from: '2026-12-30', to: '2027-01-02', time: '' }));
await t('접수일: 12월 게시 · 1/5~1/7 → 둘 다 다음 해', () => assert.deepEqual(td('[어바니엘 가산] 모집공고 (접수기간: 1/5~1/7)', '2026-12-29'), { from: '2027-01-05', to: '2027-01-07', time: '' }));
await t("접수일: '26.11.13(금) 10~15시 → 하루 · 15:00", () => assert.deepEqual(td("[독산역 롯데캐슬] 재임대 모집공고(접수: '26.11.13(금) 10~15시)", '2026-11-05'), { from: '2026-11-13', to: '2026-11-13', time: '15:00' }));
await t('접수일: 모집기간 : 26.11.05~26.11.08', () => assert.deepEqual(td('[하단 롯데캐슬]재임대 모집공고(모집기간 : 26.11.05~26.11.08)', '2026-11-04'), { from: '2026-11-05', to: '2026-11-08', time: '' }));
await t('접수일: 공고일만 있으면 없음 (공고일은 접수일이 아님)', () => assert.equal(td("[남영역 롯데캐슬] 공실세대 모집공고 (공고일:'26.11.06)", '2026-11-06'), null));
await t('접수일: 이상한 날짜는 없음', () => { assert.equal(td('[x] 모집 (접수기간: 13/40~13/41)', '2026-11-06'), null); assert.equal(td('[x] 모집 (접수기간: 11/8~11/6)', '2026-11-06'), null); });

// ---------- 엘리스 목록 ----------
const row = (idx, title, d) => ({ nt_idx: idx, nt_title: title, row_input_date: d, nt_content: '<p>본문 내용 비밀</p>', nt_atch_file_id: 'FILE1', file_stre_url: '/x.jpg' });
const LIST = { pagination: { i_iTotalPageCnt: '2' }, recruitList: [
  row('RvzE6+D7u/Tj==', '[어바니엘 염창] 공실세대 모집공고 (접수기간: 11/6~11/8)', '2026.11.06'),
  row('a1', '[용산원효루미니] 추가모집공고(접수일 &#39;26.11.09)', '2026.11.04'),
  row('a2', '[문래 롯데캐슬] 재임대 모집공고(공고일 26.11.09)---------&gt;마감되었습니다.', '2026.11.06'),
  row('a3', '[문래 롯데캐슬] &#39;26.11.06 재임대 모집공고 접수 현황', '2026.11.09'),
  row('a4', '[하단 롯데캐슬]재임대 모집공고(모집기간 : 26.11.05~26.11.08)', '2026.11.04'),
  row('a5', '[새로운 단지] 모집공고', '2026.11.04') ] };
const unknown = new Set(), items = E.parse(LIST, { unknown });
await t('엘리스: 서울 단지만 · 접수일 없는 마감 글·현황 글 빼기 · 서울 밖(하단)·모르는 단지는 빼고 기록', () => {
  assert.deepEqual(items.map(i => i.title.slice(0, 12)), ['[어바니엘 염창] 공실', "[용산원효루미니] 추가"]); assert.deepEqual([...unknown], ['하단 롯데캐슬', '새로운 단지']); });
await t('엘리스: 제목·날짜·링크만 (본문·첨부·사진 없음) · 링크 인코딩', () => {
  const s = JSON.stringify(items); assert.ok(!/본문|FILE1|x\.jpg|nt_content/.test(s), s);
  assert.equal(items[0].url, 'https://www.elyes.co.kr/post/recruit/detail?i_sNtCode=BHCT&nt_idx=RvzE6%2BD7u%2FTj%3D%3D'); assert.equal(items[0].feedId, 'elyes-RvzE6-D7u_Tj'); });
await t('엘리스: 101개 단지는 그 이름 · 그 밖의 서울은 민간임대', () => {
  assert.equal(items[1].danjiName, '남영역 용산 원효 루미니'); assert.equal(items[1].kind, '청년안심주택(민간)');
  assert.equal(items[0].danji, 'x-elyes-yeomchang'); assert.equal(items[0].kind, '민간임대'); assert.ok(items.every(i => i.direct)); });
await t('엘리스: 그 밖의 서울 민간임대 6곳 (서울 밖 없음)', () => assert.deepEqual(E.OTHERS.map(o => o.gu).sort(), ['강동구', '강서구', '금천구', '금천구', '동작구', '영등포구']));

// 실제 제목 3개 (2026-11-09 엘리스 목록) — 11/9 에 모두 피드에 나와야 함
const REAL = E.parse({ recruitList: [row('d1', '[독산역 롯데캐슬] 신혼부부특별공급세대 재임대 모집공고(접수: &#39;26.11.13(금) 10~15시)', '2026.11.05'),
  row('y1', '[용산원효루미니] 추가모집공고(접수일 &#39;26.11.09)--&gt;마감되었습니다.', '2026.11.04'), row('n1', '[남영역 롯데캐슬] 공실세대 모집공고 (공고일:&#39;26.11.06)', '2026.11.06')] });
const DJ3 = { danji: [{ id: '20000406', name: '남영역 용산 원효 루미니', gu: '용산구' }, { id: '20000574', name: '남영역 용산 남영역 롯데캐슬 헤리티지', gu: '용산구' }], other: E.OTHERS };
const feedOn = day => F.buildFeed(F.tagDanji(REAL.map(i => ({ ...i })), DJ3), day).items;
await t('실제 제목 3개: 11/9 피드에 모두 (독산역 11/13 15:00 마감 · 용산원효루미니 오늘 마감(사이트의 마감 표시가 있어도) · 남영역 공고일만 → 마감일 없음)', () => {
  const L = feedOn('2026-11-09'), by = id => L.find(i => i.id === 'elyes-' + id);
  assert.equal(L.length, 3, JSON.stringify(L.map(i => i.title)));
  assert.deepEqual([by('d1').to, by('d1').time, by('d1').region, by('d1').danji], ['2026-11-13', '15:00', '서울 금천구', 'x-elyes-doksan']);
  assert.deepEqual([by('y1').from, by('y1').to, by('y1').danji], ['2026-11-09', '2026-11-09', '20000406']);
  assert.deepEqual([by('n1').to, by('n1').region, by('n1').danji], ['', '서울 용산구', '20000574']); });
await t('실제 제목 3개: 다음 날 용산원효루미니는 빠짐 · 남영역은 게시 21일까지 · 독산역은 11/13 까지', () => {
  assert.deepEqual(feedOn('2026-11-10').map(i => i.id).sort(), ['elyes-d1', 'elyes-n1']);
  assert.deepEqual(feedOn('2026-11-14').map(i => i.id), ['elyes-n1']); assert.deepEqual(feedOn('2026-11-28').map(i => i.id), []); });

// ---------- 서울시 단지 ----------
await t('금액 읽기', () => { assert.equal(D.money('2억1천5백50만'), 21550); assert.equal(D.money('4천8백0만'), 4800); assert.equal(D.money('16만'), 16); assert.equal(D.money('-6502'), null); });
await t('역 읽기 (역 이름 없으면 비움 · 거리)', () => { assert.deepEqual(D.subway('6호선 화랑대역 6번출구 146m, 도보 2분'), { line: '6호선', station: '화랑대역', walk: 2, m: 146 });
  assert.deepEqual(D.subway('2호선, 수인분당선 8번출구 196m'), { line: '2호선, 수인분당선', station: '', walk: null, m: 196 }); });
const YO = { resultList: [
  { homeCode: '9', adresGu: '', homeName: '2026년 2차 공공임대 모집공고' },
  { homeCode: '1', adresGu: '중랑구', homeName: '화랑대역 에이트플레이스', optionSubway: '6호선 화랑대역 6번출구 146m, 도보 2분', moneyDepositLow: 48000000, moneyRentalLow: 160000, fnMoneyDepositHigh: '2억1천5백50만', fnMoneyRentalHigh: '77만', homeDetail: '긴 소개글' },
  { homeCode: '2', adresGu: '강남구', homeName: '선릉역 삼성동 마에스트로', optionSubway: '2호선, 수인분당선 8번출구 196m', fnMoneyDepositLow: '5천8백0만', fnMoneyRentalLow: '48만', fnMoneyDepositHigh: '1억7천1백0만', fnMoneyRentalHigh: '1백22만' } ] };
const list = D.parseList(YO);
await t('단지 목록: 구·이름·역·보증금/월세 범위 (만원) · 역 이름은 단지 이름에서도 · 단지 아닌 모집공고 글은 뺌', () => {
  assert.deepEqual(list[0].dep, [4800, 21550]); assert.deepEqual(list[0].rent, [16, 77]); assert.equal(list[1].station, '선릉역'); assert.deepEqual(list[1].rent, [48, 122]);
  assert.ok(!JSON.stringify(list).includes('소개글')); assert.equal(list.length, 2); });
await t('단지 상세: 시행사·홈페이지·대표전화 세 줄만', () => assert.deepEqual(D.parseView('<div><span>시행사 :</span><span>㈜대한묵동</span></div><p>홈페이지 :</p><a>https://8-place.com/</a><p>대표전화 :</p><p>02-3296-3598</p><p>본문 길게</p>'),
  { dev: '㈜대한묵동', home: 'https://8-place.com/', tel: '02-3296-3598' }));
const HIST = [{ id: 'b1', t: '[민간임대] 화랑대역 에이트플레이스 추가모집공고', d: '2026-11-05' }, { id: 'b2', t: '[민간임대] 화랑대역 에이트플레이스 입주자 모집공고', d: '2026-05-26' },
  { id: 'b3', t: '[민간임대] 선릉역 삼성동 마에스트로 모집공고', d: '2023-08-07' }, { id: 'b4', t: '[공공임대] 다른 단지 모집', d: '2026-01-01' }];
await t('공고 이력 → 단지마다 공고 수·추가모집·최근·최초', () => { const c = D.countHistory(list, HIST);
  assert.deepEqual(c.get('1'), { bbs: 2, extra: 1, lastExtra: '2026-11-05', first: '2026-05-26' }); assert.deepEqual(c.get('2'), { bbs: 1, extra: 0, lastExtra: '', first: '2023-08-07' }); });
await t("'자체 사이트에서만 공고': 1년 넘었고 추가모집 0건", () => {
  assert.equal(D.selfOnly({ first: '2023-08-07', extra: 0 }, '2026-11-09'), true); assert.equal(D.selfOnly({ first: '2026-05-26', extra: 0 }, '2026-11-09'), false); assert.equal(D.selfOnly({ first: '2023-08-07', extra: 1 }, '2026-11-09'), false); });
await t('공고 제목 → 단지 (앞의 OO역 을 빼고도 · 긴 이름이 이김)', () => {
  assert.equal(D.matchDanji('[민간임대] 삼성동 마에스트로 추가모집', list)?.id, '2'); assert.equal(D.matchDanji('아무 공고', list), null); });
await t('공급상태: 접수 중 공고가 있으면 청약중 · 없으면 표 값 (예전 청약중이 공급완료로 바뀌지 않음)', () => {
  const prev = { danji: [{ id: '1', status: '청약중', base: '청약중' }, { id: '2', status: '청약중', base: '공급완료' }] };
  const a = D.buildDanji(prev, { list, today: '2026-11-09' }), b = D.buildDanji(a, { list, openIds: new Set(['2']), today: '2026-11-10' }), c = D.buildDanji(b, { list, today: '2026-11-11' });
  assert.deepEqual(['1', '2'].map(id => a.danji.find(d => d.id === id).status), ['청약중', '공급완료']);
  assert.equal(b.danji.find(d => d.id === '2').status, '청약중'); assert.equal(c.danji.find(d => d.id === '2').status, '공급완료'); assert.equal(c.danji.find(d => d.id === '1').status, '청약중'); });
await t('CSV 첫 데이터: 따옴표·쉼표 · 표 값으로 시작', () => {
  const rows = D.parseCsv('구,단지,공급상태,시행사,시공사,홈페이지,대표전화,최초공고,서울시게시판 공고수,추가모집 수,최근 추가모집\n"중랑구","화랑대역 에이트플레이스","청약중","㈜대한, 리츠","x","https://8-place.com/","02-3296-3598","2026-05-26","5","4","2026-11-05"');
  const { out, miss } = D.seed(rows.map(r => ({ ...r, 구: '중랑구' })).concat({ 구: '강남구', 단지: '선릉역 삼성동 마에스트로', 공급상태: '청약예정' }), list, '2026-11-09'), d = out.danji.find(x => x.id === '1');
  assert.equal(d.dev, '㈜대한, 리츠'); assert.equal(d.extra, 4); assert.equal(d.status, '청약중'); assert.deepEqual(miss, []); assert.equal(out.other.length, 6); });
await t('구: 표와 서울시가 다르면 표 값 · 다음 갱신에도 유지', () => {
  const { out } = D.seed([{ 구: '강동구', 단지: '선릉역 삼성동 마에스트로', 공급상태: '' }], list, '2026-11-09'), again = D.buildDanji(out, { list, today: '2026-11-10' });
  assert.equal(out.danji.find(x => x.id === '2').gu, '강동구'); assert.equal(again.danji.find(x => x.id === '2').gu, '강동구'); assert.equal(again.danji.find(x => x.id === '1').gu, '중랑구'); });

// ---------- 공고 ↔ 단지 연결 (feed.mjs) ----------
await t('피드: 단지 직접 공고는 출처 표 이름으로 · 지역은 서울 OO구 · 공식 공고는 제목으로', () => {
  const dj = { danji: [{ id: '20000406', name: '남영역 용산 원효 루미니', gu: '용산구' }, ...list], other: E.OTHERS };
  const raw = F.tagDanji([...items.map(i => ({ ...i })), { feedId: 'youth-1', title: '[민간임대] 화랑대역 에이트플레이스 추가모집공고', region: '서울' }], dj);
  assert.equal(raw[0].danji, 'x-elyes-yeomchang'); assert.equal(raw[0].region, '서울 강서구'); assert.equal(raw[1].danji, '20000406'); assert.equal(raw[1].region, '서울 용산구'); assert.equal(raw[2].danji, '1');
  const feed = F.buildFeed(raw.map(r => ({ ...r, to: '2099-01-01' }))); assert.ok(feed.items.some(i => i.direct && i.danji === 'x-elyes-yeomchang')); });

// ---------- 네트워크: robots · 3초 간격 · 폼 ----------
const hits = []; globalThis.fetch = async (url, o) => { const u = new URL(url); hits.push({ p: u.pathname, at: Date.now(), body: String(o?.body ?? '') });
  if (u.pathname === '/robots.txt') return new Response('User-agent: *\nAllow:/');
  return new Response(JSON.stringify({ ...LIST, pagination: { i_iTotalPageCnt: '2' } })); };
const got = await E.fetchList({ pages: 3 });
await t('엘리스 받기: robots.txt 확인 · 폼으로 쪽 넘김 · 마지막 쪽에서 멈춤 · 같은 글 하나로', () => {
  assert.equal(hits[0].p, '/robots.txt'); const lists = hits.filter(h => h.p.endsWith('/recruit/list')); assert.equal(lists.length, 2);
  assert.ok(lists[1].body.includes('i_iNowPageNo=2')); assert.equal(got.length, 2); });
await t('엘리스 받기: 요청 사이 간격 (SCRAPE_GAP_MS)', () => { for (let i = 1; i < hits.length; i++) assert.ok(hits[i].at - hits[i - 1].at >= 55, hits[i].at - hits[i - 1].at); });
console.log(`\n${ok}개 모두 OK`);
