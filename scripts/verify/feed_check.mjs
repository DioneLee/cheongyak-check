// 공고 피드 스크립트 검사 (인터넷·진짜 키 없이 가짜 응답으로): node scripts/verify/feed_check.mjs
import assert from 'node:assert/strict';
process.env.DATA_GO_KR_KEY = 'TEST%2BKEY%3D%3D-only';   // 가짜 키 (Encoding 키 모양)
const F = await import('../feed.mjs');
const T = F.todayKst, d = n => T(n).replaceAll('-', ''), seen = [];
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('OK', name); };

const row = (seq, title, day) => `<tr><td>1</td><td class="txtL"><a href="#" onclick="javascript:getDetailView('${seq}');return false;"><span class="icoNew">NEW</span>
  ${title}</a></td><td>매입주택공급부</td><td class="num">
  ${day}</td><td class="num">10</td></tr>`;
const SH_HTML = '<table><tbody>' + [row('9001', '[청년형] 특화형 매입임대주택(구로구) 입주자 모집 공고', T(-3)), row('9002', '2026년 마곡 도전숙 예비1차 당첨자 발표', T(-1)),
  row('9003', '고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고', T(-2)), row('9004', '희망돌보미(사무지원) 모집공고', T(-1)), row('9005', '오래된 장기전세 입주자 모집 공고', T(-40))].join('') + '</tbody></table>';
globalThis.fetch = async (url, o) => {
  const u = new URL(url); u.m = o?.method || 'GET'; u.b = String(o?.body ?? ''); seen.push(u);
  if (u.pathname.includes('lhLeaseNoticeInfo1')) {
    const list = u.searchParams.get('UPP_AIS_TP_CD') !== '06' ? [] : [
      { PAN_ID: '1001', PAN_NM: '[정정공고] 서울 행복주택 입주자 모집', CNP_CD_NM: '서울특별시', AIS_TP_CD_NM: '행복주택', PAN_NT_ST_DT: T(-2).replaceAll('-', '.'), CLSG_DT: T(5).replaceAll('-', '.'), DTL_URL: 'https://apply.lh.or.kr/x?PAN_ID:1001', ALL_CNT: 2 },
      { PAN_ID: '1002', PAN_NM: '지난 공고', CLSG_DT: T(-1).replaceAll('-', '.'), ALL_CNT: 2 }];
    return new Response(JSON.stringify([{ dsSch: [] }, { dsList: list, resHeader: [] }]));
  }
  if (u.pathname.includes('rsdtRcritNtcList')) return new Response(JSON.stringify({ header: { resultCode: '00' }, body: { totalCount: 3, item: [
    { pblancId: 'A1', pblancNm: '서울 행복주택 입주자 모집 공고', suplyInsttNm: '한국토지주택공사', brtcNm: '서울특별시', signguNm: '마포구', suplyTyNm: '행복주택', rcritPblancDe: d(-2), beginDe: d(3), endDe: d(5), pcUrl: 'https://www.myhome.go.kr/a1' },
    { pblancId: 'A1', pblancNm: '서울 행복주택 입주자 모집 공고', signguNm: '용산구', brtcNm: '서울특별시' },
    { pblancId: 'B2', pblancNm: '장기전세 모집', suplyInsttNm: 'SH서울주택도시공사', brtcNm: '서울특별시', signguNm: '강서구', rcritPblancDe: d(-1), beginDe: d(10), endDe: d(12), pcUrl: 'javascript:alert(1)' }] } }));
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
t('청년안심주택: 신청일 = 마감일 · 공공/민간 · 상세 링크 · 빈 제목 뺌', () => { assert.equal(yo.length, 2); const a = yo[0];
  assert.equal(a.title, '[민간임대] 개봉역 세이지움 & 개봉 추가모집공고'); assert.equal(a.to, T(3)); assert.equal(a.from, ''); assert.equal(a.kind, '청년안심주택(민간)'); assert.equal(a.region, '서울');
  assert.equal(a.url, 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=7001&menuNo=400008'); assert.equal(F.buildFeed(yo).items.length, 1); });
t('청년안심주택은 POST · 키 안 보냄', () => { const y = seen.filter(u => u.hostname === 'soco.seoul.go.kr'); assert.equal(y.length, 1); assert.ok(y[0].m === 'POST' && y[0].b.includes('bbsId=BMSR00015') && !y[0].b.includes('TEST')); });
let shErr = ''; { const f0 = globalThis.fetch; globalThis.fetch = async () => new Response('<html>점검 중</html>'); try { await F.fetchSH({ pages: 1 }); } catch (e) { shErr = e.message; } globalThis.fetch = f0; }
t('SH 목록 모양이 바뀌면 SH 만 실패로', () => assert.equal(shErr, 'SH 게시판: 목록 모양이 바뀜'));
const feed = F.buildFeed([...my, ...lh]);
t('같은 공고(머리말·공고 글자 차이) 합침 · LH 우선 · 빈 칸 채움', () => {
  assert.equal(feed.items.length, 2); const a = feed.items[0];
  assert.equal(a.id, 'lh-1001'); assert.equal(a.from, T(3)); assert.equal(a.region, '서울 마포구 외 1곳'); });
t('마감 가까운 순 · http(s) 링크만', () => { assert.equal(feed.items[1].id, 'myhome-B2'); assert.equal(feed.items[1].url, ''); });
t('서울 밖 공고는 뺌', () => { const g = F.buildFeed([{ feedId: 'lh-9', org: 'LH', title: '경기 행복주택', region: '경기', kind: '', posted: T(-1), from: '', to: T(3), url: '' }]); assert.equal(g.items.length, 0); });
t('최상위 형식 · 출처 이름', () => { assert.deepEqual(Object.keys(feed), ['updated', 'source', 'items']); assert.equal(feed.source, '마이홈포털·LH 공식 API · SH·청년안심주택 게시판'); assert.match(feed.updated, /\+09:00$/); });
t('항목 필드 9개 (사이트 normFeed 와 같은 모양)', () => assert.deepEqual(Object.keys(feed.items[0]), ['id', 'org', 'title', 'region', 'kind', 'posted', 'from', 'to', 'url']));
t('오류 메시지에서 키 지움', () => { const m = F.scrub('x serviceKey=TEST+KEY==-only&y TEST%2BKEY%3D%3D-only'); assert.ok(!m.includes('TEST'), m); });
let err = ''; globalThis.fetch = async () => new Response('<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>');
try { await F.fetchLH(); } catch (e) { err = e.message; }
t('게이트웨이 XML 오류는 짧은 메시지로', () => assert.equal(err, 'LH API: SERVICE_KEY_IS_NOT_REGISTERED_ERROR'));
console.log(`${ok}개 모두 OK`);
