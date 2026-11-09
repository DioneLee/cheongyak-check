// 공고 피드 스크립트 검사 (인터넷·진짜 키 없이 가짜 응답으로): node scripts/verify/feed_check.mjs
import assert from 'node:assert/strict';
process.env.DATA_GO_KR_KEY = 'TEST%2BKEY%3D%3D-only';   // 가짜 키 (Encoding 키 모양)
process.env.SCRAPE_GAP_MS = '60';   // 게시판 요청 간격 (실제 3000 · 검사는 짧게)
const F = await import('../feed.mjs');
const T = F.todayKst, d = n => T(n).replaceAll('-', ''), seen = [], robotsSeen = [], hitAt = {};
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('OK', name); };

const row = (seq, title, day) => `<tr><td>1</td><td class="txtL"><a href="#" onclick="javascript:getDetailView('${seq}');return false;"><span class="icoNew">NEW</span>
  ${title}</a></td><td>매입주택공급부</td><td class="num">
  ${day}</td><td class="num">10</td></tr>`;
const SH_HTML = '<table><tbody>' + [row('9001', '[청년형] 특화형 매입임대주택(구로구) 입주자 모집 공고', T(-3)), row('9002', '2026년 마곡 도전숙 예비1차 당첨자 발표', T(-1)),
  row('9003', '고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고', T(-2)), row('9004', '희망돌보미(사무지원) 모집공고', T(-1)), row('9005', '오래된 장기전세 입주자 모집 공고', T(-40))].join('') + '</tbody></table>';
globalThis.fetch = async (url, o) => {
  const u = new URL(url); u.m = o?.method || 'GET'; u.b = String(o?.body ?? '');
  (hitAt[u.hostname] ??= []).push(Date.now());
  if (u.pathname === '/robots.txt') { robotsSeen.push(u.hostname);   // SH 는 실제와 같은 모양(AI 봇만 전부 막음) · 청년안심은 실제처럼 403(= 규칙 없음)
    return u.hostname === 'www.i-sh.co.kr' ? new Response(['User-agent: *', 'Disallow: /admin', 'Disallow: /gcms/brd', 'User-agent: ClaudeBot', 'Disallow: /'].join(String.fromCharCode(10))) : new Response('', { status: 403 }); }
  seen.push(u);
  if (u.pathname.includes('lhLeaseNoticeInfo1')) {
    const list = u.searchParams.get('UPP_AIS_TP_CD') !== '06' ? [] : [
      { PAN_ID: '1001', PAN_NM: '[정정공고] 서울 행복주택 입주자 모집', CNP_CD_NM: '서울특별시', AIS_TP_CD_NM: '행복주택', PAN_NT_ST_DT: T(-2).replaceAll('-', '.'), CLSG_DT: T(5).replaceAll('-', '.'), DTL_URL: 'https://apply.lh.or.kr/x?PAN_ID:1001', ALL_CNT: 2 },
      { PAN_ID: '1002', PAN_NM: '지난 공고', CLSG_DT: T(-1).replaceAll('-', '.'), ALL_CNT: 2 }];
    return new Response(JSON.stringify([{ dsSch: [] }, { dsList: list, resHeader: [] }]));
  }
  if (u.pathname.includes('rsdtRcritNtcList')) return new Response(JSON.stringify({ header: { resultCode: '00' }, body: { totalCount: 3, item: [
    { pblancId: 'A1', pblancNm: '서울 행복주택 입주자 모집 공고', suplyInsttNm: '한국토지주택공사', brtcNm: '서울특별시', signguNm: '마포구', suplyTyNm: '행복주택', rcritPblancDe: d(-2), beginDe: d(3), endDe: d(5), pcUrl: 'https://www.myhome.go.kr/a1',
      hsmpNm: '마포 행복주택', houseTyNm: '아파트', totHshldCo: '63', rentGtn: '46500000', enty: '4650000', mtRntchrg: '225000', przwnerPresnatnDe: '20270305', refrnc: '02-6265-0620', url: 'https://www.kohom.or.kr/x', fullAdres: '서울특별시 마포구 1' },
    { pblancId: 'A1', pblancNm: '서울 행복주택 입주자 모집 공고', signguNm: '용산구', brtcNm: '서울특별시' },
    { pblancId: 'B2', pblancNm: '장기전세 모집', suplyInsttNm: 'SH서울주택도시공사', brtcNm: '서울특별시', signguNm: '강서구', rcritPblancDe: d(-1), beginDe: d(10), endDe: d(12), pcUrl: 'javascript:alert(1)' }] } }));
  if (u.hostname === 'soco.seoul.go.kr' && u.pathname.endsWith('view.do')) return new Response(u.searchParams.get('boardId') !== '7001' ? '<p>본문 없음</p>'
    : `<h3>[민간임대] 개봉역 세이지움 &amp; 개봉 추가모집공고</h3><p>[공급일정]</p><p>■청약신청 : ‘${T(3).slice(2, 4)}. ${T(3).slice(5, 7)}. ${T(3).slice(8)}. (월) ~ ${T(4).slice(5, 7)}. ${T(4).slice(8)}. (화) 00:00 ~ 23:00</p><p>■ 청약신청 페이지 : https://naver.me/x</p><p>다음글</p>`);
  if (u.hostname === 'soco.seoul.go.kr') return new Response(JSON.stringify({ pagingInfo: { totPage: 1 }, resultList: [
    { boardId: 7001, nttSj: '[민간임대] 개봉역 세이지움 &amp; 개봉 추가모집공고', optn1: T(-1), optn4: T(3), optn2: '2' },
    { boardId: 7002, nttSj: '[공공임대] 지난 공고', optn1: T(-9), optn4: T(-2), optn2: '1' }, { boardId: 7003, nttSj: '' }] }));
  if (u.hostname === 'www.i-sh.co.kr') return new Response(u.pathname.includes('m_247') ? SH_HTML : '<table><tbody>getDetailView</tbody></table>');
  return new Response('<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>', { status: 200 });
};

const lh = await F.fetchLH(), my = await F.fetchMyHome(), sh = await F.fetchSH({ pages: 1 }), yo = await F.fetchYouth();
t('LH: 마감 지난 공고 빼고 날짜·지역 정리', () => { assert.equal(lh.length, 1); assert.equal(lh[0].region, '서울'); assert.equal(lh[0].to, T(5)); assert.equal(lh[0].from, ''); });
t('마이홈: 같은 pblancId 는 한 공고 · 구 목록', () => { assert.equal(my.length, 2); assert.equal(my[0].region, '서울 마포구 외 1곳'); assert.equal(my[0].org, 'LH'); assert.equal(my[1].org, 'SH'); });
t('키는 Decoding 해서 serviceKey 로만 보냄 · SH 에는 안 보냄', () => { const api = seen.filter(u => u.hostname === 'apis.data.go.kr'), sh = seen.filter(u => u.hostname === 'www.i-sh.co.kr');
  assert.ok(api.length && api.every(u => u.searchParams.get('serviceKey') === 'TEST+KEY==-only')); assert.ok(sh.length && sh.every(u => !u.search && !u.b.includes('TEST'))); });
t('SH 게시판: 모집공고만 (당첨·채용 글 뺌) · 구 이름 · 종류 · 상세 링크', () => {
  assert.deepEqual(sh.map(i => i.feedId), ['sh-9001', 'sh-9003', 'sh-9005']); assert.equal(sh[0].region, '서울 구로구'); assert.equal(sh[0].kind, '매입임대');
  assert.equal(sh[1].region, '서울'); assert.equal(sh[1].kind, '토지임대부'); assert.equal(sh[0].to, ''); assert.equal(sh[0].posted, T(-3)); assert.match(sh[0].url, /^https:\/\/www\.i-sh\.co\.kr\/.*view\.do\?multi_itm_seq=2&seq=9001$/); });
t('SH 쪽 넘김은 POST (page=1 · 임대·분양 두 게시판)', () => { const sh = seen.filter(u => u.hostname === 'www.i-sh.co.kr'); assert.equal(sh.length, 2); assert.ok(sh.every(u => u.m === 'POST' && u.b.includes('page=1'))); });
t('SH: 마감일 없는 공고는 게시 21일까지만', () => { const g = F.buildFeed(sh); assert.deepEqual(g.items.map(i => i.id).sort(), ['sh-9001', 'sh-9003']); });
t('청년안심주택: 상세 본문에서 마감일·시각 · 못 읽으면 시작일(startOnly) · 공공/민간 · 상세 링크 · 빈 제목 뺌', () => { assert.equal(yo.length, 2); const a = yo[0];
  assert.equal(a.title, '[민간임대] 개봉역 세이지움 & 개봉 추가모집공고'); assert.equal(a.from, T(3)); assert.equal(a.to, T(4)); assert.equal(a.time, '23:00'); assert.equal(a.startOnly, false);
  assert.equal(yo[1].to, T(-2)); assert.equal(yo[1].startOnly, true); assert.equal(a.kind, '청년안심주택(민간)'); assert.equal(a.region, '서울');
  assert.equal(a.url, 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=7001&menuNo=400008'); assert.equal(F.buildFeed(yo).items.length, 1); });
t('청년안심주택은 POST · 키 안 보냄', () => { const y = seen.filter(u => u.hostname === 'soco.seoul.go.kr' && u.m === 'POST'); assert.equal(y.length, 1); assert.ok(y[0].m === 'POST' && y[0].b.includes('bbsId=BMSR00015') && !y[0].b.includes('TEST')); });
t('마감일 읽기: 더포디엄830 본문 → 11.10 23:00', () => assert.deepEqual(F.parseDue('[공급일정]\n■모집공고 : ‘26. 11. 05. (목)\n■청약신청 : ‘26. 11. 09. (월) ~ 11. 10. (화) 00:00 ~ 23:00\n■서류심사 대상자 발표 : ‘26. 11. 11. (수) 17:00 예정', '2026-11-09'), { from: '2026-11-09', to: '2026-11-10', time: '23:00' }));
t('마감일 읽기: 시작 시각 있음 · 하루짜리 · 24:00 · 해 넘김 · 못 읽음', () => {
  assert.deepEqual(F.parseDue('■청약신청 : ‘26. 11. 06. (금) 09:00 ~ 11. 10. (화) 23:00'), { from: '2026-11-06', to: '2026-11-10', time: '23:00' });
  assert.deepEqual(F.parseDue('■청약신청 : ‘26. 11. 02. (월) 00:00 ~ 23:00'), { from: '2026-11-02', to: '2026-11-02', time: '23:00' });
  assert.equal(F.parseDue('■청약신청 : ‘26. 11. 12. (목) 00:00 ~ 11. 15. (일) 24:00').time, '24:00');
  assert.equal(F.parseDue('■청약신청 : ‘26. 12. 30. (수) ~ 01. 02. (토) 18:00').to, '2027-01-02');
  assert.equal(F.parseDue('■ 청약신청 페이지 : https://naver.me/x'), null); assert.equal(F.parseDue('청약신청 : 추후 안내'), null); });
t('마이홈: API 기본 정보 → 상세 (주택·가격·일정·문의·주소)', () => { const b = my[0].basic;
  assert.deepEqual(b.supply[0], { type: '마포 행복주택', area: '아파트', units: '총 63세대', price: '보증금 4,650만원 · 계약금 465만원 · 월 22.5만원', movein: null });
  assert.deepEqual(b.schedule, [{ label: '접수', date: `${T(3).replaceAll('-', '.')} ~ ${T(5).replaceAll('-', '.')}` }, { label: '당첨자 발표', date: '2027.03.05' }]);
  assert.equal(b.contact, '02-6265-0620'); assert.equal(b.apply, '공급기관 공고: https://www.kohom.or.kr/x'); assert.equal(b.addr, '서울특별시 마포구 1'); assert.deepEqual(b.eligibility, []); });
t('정정공고: 같은 기관·같은 단지의 예전 공고는 숨김 · 다른 단지·다른 기관은 그대로', () => {
  const mk = (id, org, title, posted, to = '') => ({ feedId: id, org, title, region: '서울', kind: '', posted, from: '', to, url: '' });
  const g = F.buildFeed([mk('sh-1', 'SH', '고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고', T(-9), T(9)), mk('sh-2', 'SH', '[정정] 고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고', T(-3), T(12)),
    mk('sh-3', 'SH', '고덕강일지구 5단지 입주자모집공고', T(-9), T(9)), mk('lh-4', 'LH', '고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고', T(-9), T(10)),
    mk('youth-5', '청년안심', '[민간임대] 화랑대역 에이트플레이스 추가모집공고', T(-2), T(3)), mk('youth-6', '청년안심', '[민간임대] 화랑대역 에이트플레이스 추가모집 변경공고', T(-1), T(4))]);
  assert.deepEqual(g.items.map(i => i.id).sort(), ['lh-4', 'sh-2', 'sh-3', 'youth-6']); });
t('정정공고 열쇠: 정정 글자·괄호를 빼면 같은 이름', () => { assert.equal(F.fixKey('[정정공고]평택시 10년 공공임대 모집공고'), F.fixKey('평택시 10년 공공임대 모집공고')); assert.notEqual(F.fixKey('A단지 모집'), F.fixKey('B단지 모집')); });
t('robots.txt: 사이트마다 한 번만 확인 · User-agent: * 규칙만 봄', () => {
  assert.deepEqual(robotsSeen.sort(), ['soco.seoul.go.kr', 'www.i-sh.co.kr']);
  const r = ['User-agent: *', 'Disallow: /admin', 'User-agent: ClaudeBot', 'Disallow: /'].join(String.fromCharCode(13, 10));
  assert.equal(F.robotsAllows(r, '/app/lay2/program/x/list.do'), true); assert.equal(F.robotsAllows(r, '/admin/x'), false);
  assert.equal(F.robotsAllows('', '/x'), true); assert.equal(F.robotsAllows('User-agent: *' + String.fromCharCode(10) + 'Disallow: /', '/x'), false); });
t('게시판 요청 사이 간격 (같은 사이트 · SCRAPE_GAP_MS)', () => { for (const h of ['www.i-sh.co.kr', 'soco.seoul.go.kr']) { const a = hitAt[h];
  assert.ok(a.length >= 2); for (let i = 1; i < a.length; i++) assert.ok(a[i] - a[i - 1] >= 55, `${h} ${a[i] - a[i - 1]}ms`); } });
let shErr = ''; { const f0 = globalThis.fetch; globalThis.fetch = async () => new Response('<html>점검 중</html>'); try { await F.fetchSH({ pages: 1 }); } catch (e) { shErr = e.message; } globalThis.fetch = f0; }
t('SH 목록 모양이 바뀌면 SH 만 실패로', () => assert.equal(shErr, 'SH 게시판: 목록 모양이 바뀜'));
const feed = F.buildFeed([...my, ...lh]);
t('같은 공고(머리말·공고 글자 차이) 합침 · LH 우선 · 빈 칸 채움', () => {
  assert.equal(feed.items.length, 2); const a = feed.items[0];
  assert.equal(a.id, 'lh-1001'); assert.equal(a.from, T(3)); assert.equal(a.region, '서울 마포구 외 1곳'); });
t('마감 가까운 순 · http(s) 링크만', () => { assert.equal(feed.items[1].id, 'myhome-B2'); assert.equal(feed.items[1].url, ''); });
t('서울 밖 공고는 뺌', () => { const g = F.buildFeed([{ feedId: 'lh-9', org: 'LH', title: '경기 행복주택', region: '경기', kind: '', posted: T(-1), from: '', to: T(3), url: '' }]); assert.equal(g.items.length, 0); });
t('최상위 형식 · 출처 이름', () => { assert.deepEqual(Object.keys(feed), ['updated', 'source', 'items']); assert.equal(feed.source, '마이홈포털·LH 공식 API · SH·청년안심주택 게시판'); assert.match(feed.updated, /\+09:00$/); });
t('항목 필드 17개 (사이트 normFeed 와 같은 모양)', () => assert.deepEqual(Object.keys(feed.items[0]), ['id', 'org', 'title', 'region', 'kind', 'posted', 'from', 'to', 'url', 'time', 'startOnly', 'detail', 'dv', 'ev', 'cr', 'ty', 'st']));
t('오류 메시지에서 키 지움', () => { const m = F.scrub('x serviceKey=TEST+KEY==-only&y TEST%2BKEY%3D%3D-only'); assert.ok(!m.includes('TEST'), m); });
let err = ''; globalThis.fetch = async () => new Response('<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>');
try { await F.fetchLH(); } catch (e) { err = e.message; }
t('게이트웨이 XML 오류는 짧은 메시지로', () => assert.equal(err, 'LH API: SERVICE_KEY_IS_NOT_REGISTERED_ERROR'));
console.log(`${ok}개 모두 OK`);
