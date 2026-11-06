// 공고 피드 스크립트 검사 (인터넷·진짜 키 없이 가짜 응답으로): node scripts/verify/feed_check.mjs
import assert from 'node:assert/strict';
process.env.DATA_GO_KR_KEY = 'TEST%2BKEY%3D%3D-only';   // 가짜 키 (Encoding 키 모양)
const F = await import('../feed.mjs');
const T = F.todayKst, d = n => T(n).replaceAll('-', ''), seen = [];
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('OK', name); };

globalThis.fetch = async url => {
  const u = new URL(url); seen.push(u);
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
  return new Response('<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>', { status: 200 });
};

const lh = await F.fetchLH(), my = await F.fetchMyHome();
t('LH: 마감 지난 공고 빼고 날짜·지역 정리', () => { assert.equal(lh.length, 1); assert.equal(lh[0].region, '서울'); assert.equal(lh[0].to, T(5)); assert.equal(lh[0].from, ''); });
t('마이홈: 같은 pblancId 는 한 공고 · 구 목록', () => { assert.equal(my.length, 2); assert.equal(my[0].region, '서울 마포구 외 1곳'); assert.equal(my[0].org, 'LH'); assert.equal(my[1].org, 'SH'); });
t('키는 Decoding 해서 serviceKey 로만 보냄', () => { assert.ok(seen.every(u => u.searchParams.get('serviceKey') === 'TEST+KEY==-only')); });
const feed = F.buildFeed([...my, ...lh]);
t('같은 공고(머리말·공고 글자 차이) 합침 · LH 우선 · 빈 칸 채움', () => {
  assert.equal(feed.items.length, 2); const a = feed.items[0];
  assert.equal(a.id, 'lh-1001'); assert.equal(a.from, T(3)); assert.equal(a.region, '서울 마포구 외 1곳'); });
t('마감 가까운 순 · http(s) 링크만', () => { assert.equal(feed.items[1].id, 'myhome-B2'); assert.equal(feed.items[1].url, ''); });
t('서울 밖 공고는 뺌', () => { const g = F.buildFeed([{ feedId: 'lh-9', org: 'LH', title: '경기 행복주택', region: '경기', kind: '', posted: T(-1), from: '', to: T(3), url: '' }]); assert.equal(g.items.length, 0); });
t('최상위 형식 · 출처 이름', () => { assert.deepEqual(Object.keys(feed), ['updated', 'source', 'items']); assert.equal(feed.source, '마이홈포털·LH 공식 API'); assert.match(feed.updated, /\+09:00$/); });
t('항목 필드 9개 (사이트 normFeed 와 같은 모양)', () => assert.deepEqual(Object.keys(feed.items[0]), ['id', 'org', 'title', 'region', 'kind', 'posted', 'from', 'to', 'url']));
t('오류 메시지에서 키 지움', () => { const m = F.scrub('x serviceKey=TEST+KEY==-only&y TEST%2BKEY%3D%3D-only'); assert.ok(!m.includes('TEST'), m); });
let err = ''; globalThis.fetch = async () => new Response('<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>');
try { await F.fetchLH(); } catch (e) { err = e.message; }
t('게이트웨이 XML 오류는 짧은 메시지로', () => assert.equal(err, 'LH API: SERVICE_KEY_IS_NOT_REGISTERED_ERROR'));
console.log(`${ok}개 모두 OK`);
