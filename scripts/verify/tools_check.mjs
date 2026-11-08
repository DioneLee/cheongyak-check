// 캘린더(.ics) · 신청 가능 배지 · 필터 · 공고 글 구조화 검사: node scripts/verify/tools_check.mjs (인터넷 안 씀)
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const FT = createRequire(import.meta.url)('../../lib/feed-tools.js');
const E = await import('../enrich.mjs');
let ok = 0; const t = async (n, f) => { await f(); ok++; console.log('OK', n); };

// 더포디엄830: 실제 상세 파일 + 목록 값(청약 11.9~11.10 23:00)
const D6720 = JSON.parse(await readFile(new URL('../../feed/detail/youth-6720.json', import.meta.url), 'utf8'));
const I6720 = { id: 'youth-6720', title: '[민간임대] 건대입구역 더포디엄830 추가모집공고', url: 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=6720&menuNo=400008', posted: '2026-11-05', from: '2026-11-09', to: '2026-11-10', time: '23:00', startOnly: false, detail: true };
const ev = E.eventsFor(I6720, D6720), ty = E.typesOf(D6720), cr = E.critsOf(D6720);

await t('일정: 청약 시작 11.9 · 마감 11.10 23:00 · 발표 11.11 17:00 · 서류 11.12~13 · 계약 11.17~20', async () => assert.deepEqual(ev.map(e => [e.k, e.d, e.e || '', e.t || '']), [
  ['start', '2026-11-09', '', ''], ['end', '2026-11-10', '', '23:00'], ['announce', '2026-11-11', '', '17:00'], ['docs', '2026-11-12', '2026-11-13', ''], ['contract', '2026-11-17', '2026-11-20', '']]));
await t('날짜 글 읽기: 여러 모양 (점·월일·오전/오후·24:00·해 넘김)', async () => {
  assert.deepEqual(E.parseWhen('2026. 11. 2. ~ 11. 12. 18시', 2026), { d1: '2026-11-02', d2: '2026-11-12', t1: '', t2: '18:00' });
  assert.deepEqual(E.parseWhen('11월 10일 ~ 11월 17일', 2026), { d1: '2026-11-10', d2: '2026-11-17', t1: '', t2: '' });
  assert.deepEqual(E.parseWhen('2026.11.18 ~ 2026.11.20 오전 10시 ~ 오후 17시', 2026), { d1: '2026-11-18', d2: '2026-11-20', t1: '10:00', t2: '17:00' });
  assert.deepEqual(E.parseWhen('2026.12.30 ~ 01.02 24:00', 2026), { d1: '2026-12-30', d2: '2027-01-02', t1: '', t2: '24:00' });
  assert.equal(E.parseWhen('추후 개별 연락', 2026), null); assert.equal(E.parseWhen('2027년 1월 중', 2026), null); });

const n6720 = { id: 'youth-6720', name: '건대입구역 더포디엄830', url: I6720.url, apply: 'https://naver.me/GUTJuhOO', ev };
const ics1 = FT.ics([n6720]), ics2 = FT.ics([n6720]);
const vevent = (s, uid) => s.replace(/\r\n /g, '').split('BEGIN:VEVENT').find(b => b.includes(`UID:${uid}`));
await t('.ics: 마감 2026-11-10 23:00(Asia/Seoul) 이벤트 + 알림 2개(하루 전 09:00 · 3시간 전)', async () => {
  const e = vevent(ics1, 'youth-6720-end@dionelee.github.io'); assert.ok(e);
  assert.match(e, /DTEND;TZID=Asia\/Seoul:20261110T230000\r\n/); assert.match(e, /SUMMARY:\[청약\] 건대입구역 더포디엄830 · 청약 마감 \(23:00까지\)/);
  assert.equal((e.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.match(e, /TRIGGER;VALUE=DATE-TIME:20261109T000000Z/); assert.match(e, /TRIGGER;VALUE=DATE-TIME:20261110T110000Z/);   // 11.9 09:00 KST · 11.10 20:00 KST
  assert.match(e, /DESCRIPTION:.*공고 원문: https:\/\/soco\.seoul\.go\.kr.*\\n신청: https:\/\/naver\.me\/GUTJuhOO/); });
await t('.ics: 같은 공고로 다시 만들면 UID 가 같음 (캘린더에서 갱신)', async () => {
  const uids = s => [...s.replace(/\r\n /g, '').matchAll(/^UID:(.+)$/gm)].map(m => m[1].trim());
  assert.deepEqual(uids(ics1), uids(ics2)); assert.deepEqual(uids(ics1), ['youth-6720-start@dionelee.github.io', 'youth-6720-end@dionelee.github.io', 'youth-6720-announce@dionelee.github.io', 'youth-6720-docs@dionelee.github.io', 'youth-6720-contract@dionelee.github.io']); });
await t('.ics: RFC 5545 형식 — 모든 줄 CRLF · 75바이트 이하 · 접은 줄은 공백으로 시작 · VCALENDAR/VTIMEZONE · 하루 종일은 VALUE=DATE', async () => {
  assert.ok(ics1.endsWith('\r\n')); assert.ok(!/[^\r]\n/.test(ics1), 'LF 만 있는 줄');
  const lines = ics1.split('\r\n').slice(0, -1); for (const l of lines) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `${Buffer.byteLength(l)}바이트: ${l}`);
  assert.ok(lines.some(l => l.startsWith(' ')), '긴 줄이 접혀 있어야 함'); assert.equal(lines[0], 'BEGIN:VCALENDAR'); assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes('VERSION:2.0') && lines.includes('TZID:Asia/Seoul')); assert.ok(lines.includes('DTSTART;VALUE=DATE:20261117') && lines.includes('DTEND;VALUE=DATE:20261121'));
  const unfolded = ics1.replace(/\r\n /g, ''); assert.match(unfolded, /SUMMARY:\[청약\] 건대입구역 더포디엄830 · 청약 마감 \(23:00까지\)\r\n/);   // 접었다 펴도 글자 그대로
  assert.equal((ics1.match(/BEGIN:VEVENT/g) || []).length, (ics1.match(/END:VEVENT/g) || []).length); });
await t('.ics: 시각 없는 마감은 하루 종일 · 알림은 전날 09:00 · 그날 21:00', async () => {
  const s = FT.ics([{ id: 'x-1', name: 'A', ev: [{ k: 'end', d: '2026-11-13' }] }]).replace(/\r\n /g, '');
  assert.match(s, /DTSTART;VALUE=DATE:20261113/); assert.match(s, /TRIGGER;VALUE=DATE-TIME:20261112T000000Z/); assert.match(s, /TRIGGER;VALUE=DATE-TIME:20261113T120000Z/); });
await t('구독 캘린더는 청약 시작·마감만 · 내용이 같으면 파일도 같음(DTSTAMP 고정)', async () => {
  const s = FT.ics([n6720], { kinds: ['start', 'end'], dtstamp: () => '20261105T000000Z', refresh: 'PT3H' });
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 2); assert.match(s, /REFRESH-INTERVAL;VALUE=DURATION:PT3H/); assert.equal(s, FT.ics([n6720], { kinds: ['start', 'end'], dtstamp: () => '20261105T000000Z', refresh: 'PT3H' })); });

// 신청 가능 배지 (내 조건 × 자격 기준)
const today = '2026-11-08';
const me = { a: { birth: '1997-03-01', income: 300 }, b: {}, nw: {}, yt: { single: true, homeless: true, house: 'alone', asset: 5000 }, hasCar: false, car: null, live: { city: '서울' }, work: {} };
await t('자격 기준 읽기 (더포디엄830): 나이 19~39 · 세대 무주택 · 자동차 4,542만원', async () => assert.deepEqual(cr.c, [{ k: 'age', min: 19, max: 39 }, { k: 'homeless', scope: '세대' }, { k: 'car', max: 4542 }]));
await t('배지: 정보가 다 있고 모두 통과 → 가능', async () => { const r = FT.judge(me, cr, { tier: 'youth', today }); assert.equal(r.st, 'ok', JSON.stringify(r.why));
  assert.deepEqual(r.why.filter(w => !w.extra).map(w => [w.ok, w.t, w.v]), [[true, '나이 만 19~39세', '만 29세'], [true, '세대원 모두 무주택', '무주택'], [true, '자동차가액 4,542만원 이하', '자동차 없음']]); });
const crInc = { c: [...cr.c, { k: 'income', pct: 100, amt: { 1: 458 } }], x: 0 };
await t('배지: 소득 기준이 있는데 소득 미입력 → 확인 필요 (이유: 입력 안 함)', async () => {
  assert.equal(FT.judge(me, crInc, { tier: 'youth', today }).st, 'ok');
  const r = FT.judge({ ...me, a: { birth: me.a.birth, income: null } }, crInc, { tier: 'youth', today }); assert.equal(r.st, 'unk'); assert.deepEqual(r.why.find(w => w.t.startsWith('월평균소득')), { ok: null, t: '월평균소득 100% 이하', v: '입력 안 함' }); });
await t('배지: 나이 초과 → 어려움', async () => { const r = FT.judge({ ...me, a: { birth: '1980-01-01', income: 300 } }, cr, { tier: 'youth', today }); assert.equal(r.st, 'no'); assert.deepEqual(r.why[0], { ok: false, t: '나이 만 19~39세', v: '만 46세' }); });
await t('배지: 자동차 있음인데 가액 미입력 → 확인 필요 "입력 안 함"', async () => { const r = FT.judge({ ...me, hasCar: true }, cr, { tier: 'youth', today }); assert.equal(r.st, 'unk'); assert.deepEqual(r.why[2], { ok: null, t: '자동차가액 4,542만원 이하', v: '입력 안 함' }); });
await t('배지: 자격 기준이 구조화돼 있지 않은 공고 → 확인 필요 (판정 안 함)', async () => { assert.equal(FT.judge(me, null, { tier: 'youth', today }).st, 'unk'); assert.equal(FT.judge(me, { c: [], x: 3 }, { tier: 'youth', today }).st, 'unk'); });
await t('배지: 조건부 기준(소득 50% 이하만 해당 등)을 넘으면 어려움이 아니라 확인 필요', async () => {
  assert.equal(FT.judge({ ...me, yt: { ...me.yt, asset: 30000 } }, { c: [{ k: 'asset', max: 24500, cond: true }], x: 0 }, { tier: 'youth', today }).st, 'unk');
  assert.equal(FT.judge({ ...me, yt: { ...me.yt, asset: 30000 } }, { c: [{ k: 'asset', max: 24500 }], x: 0 }, { tier: 'youth', today }).st, 'no'); });

// 필터
const it6720 = { ...I6720, ty, st: { n: '건대입구역', m: 150, w: 3 } }, noDet = { id: 'lh-1', title: 'LH 공고', ty: [], st: null };
await t('필터: 보증금 1억 이하 → 더포디엄830 남음 · 25A·25B 만 강조', async () => { const r = FT.filterItem(it6720, { dep: 10000 }); assert.equal(r.st, 'ok'); assert.deepEqual(r.hits.map(k => D6720.supply[k].type), ['25A 1510호', '25B 529호']); });
await t('필터: 상세 없는 공고(LH 등) → 정보 없음 (숨기지 않음)', async () => { assert.equal(FT.filterItem(noDet, { dep: 10000 }).st, 'unk'); assert.equal(FT.filterItem(noDet, { walk: 10 }).st, 'unk'); });
await t('필터: 역 거리 좌표 없음 → 정보 없음 · 거리 넘음 → 숨김 · 조건 없음 → 전부', async () => {
  assert.equal(FT.filterItem({ ...it6720, st: null }, { walk: 10 }).st, 'unk'); assert.equal(FT.filterItem({ ...it6720, st: { w: 12 } }, { walk: 10 }).st, 'no'); assert.equal(FT.filterItem(it6720, {}).st, 'all'); });
await t('필터: 보증금 5천 이하·면적 40㎡ 이상 → 안 맞음 · 월세 70 이하 + 면적 20 이상 → 25A·25B', async () => {
  assert.equal(FT.filterItem(it6720, { dep: 5000 }).st, 'no'); assert.deepEqual(FT.filterItem(it6720, { rent: 70, area: 20 }).hits, [0, 1]); });
await t('주택형 읽기: 보증금·월세 만원 · 면적 (범위는 아래 값)', async () => {
  assert.deepEqual(ty.slice(0, 2), [{ n: '25A 1510호', a: 20.17, dep: 9300, rent: 64.72 }, { n: '25B 529호', a: 20.4, dep: 9300, rent: 64.92 }]);
  assert.deepEqual(E.typesOf({ supply: [{ type: '25형', area: '22.53㎡', price: '보증금 6,200만~10,400만 원 / 월세 41만~58만 원' }] })[0], { n: '25형', a: 22.53, dep: 6200, rent: 41 }); });
await t('역 거리: 가장 가까운 역 · 도보 분 = 거리 ÷ 67 × 1.3', async () => { const r = E.nearest([37.5408, 127.0668], { 건대입구역: [37.54044, 127.07086], 성수역: [37.5446, 127.0557] });
  assert.equal(r.n, '건대입구역'); assert.equal(r.w, Math.max(1, Math.round(r.m / 67 * 1.3))); assert.ok(r.m > 300 && r.m < 450, String(r.m)); });
await t('주소 줄 읽기: 주택위치 줄 · 괄호 뺌 · 서울 아니면 없음', async () => {
  assert.equal(E.addrFrom('[단지개요]\n■주택위치 : 서울특별시 광진구 아차산로 212 (2, 7호선 건대입구역 6번 출구)'), '서울특별시 광진구 아차산로 212');
  assert.equal(E.addrFrom('- 사회주택 소재지: 서울시 종로구 옥인동 47-334 외 2필지'), '서울시 종로구 옥인동 47-334'); assert.equal(E.addrFrom('주소: 경기도 성남시 1'), null); });
await t('좌표 찾기: 번지까지 찾은 결과만 저장 · 도로·동 수준은 정보 없음 · 실패는 7일 뒤 다시', async () => { process.env.GEO_GAP_MS = '0'; const cache = {}; let n = 0;
  const ll = await E.geocode('서울 A', cache, { fetchFn: async () => { n++; return new Response(JSON.stringify([{ lat: '37.5', lon: '127.1', address: { house_number: '212' } }])); } }); assert.deepEqual(ll, [37.5, 127.1]);
  assert.equal(await E.geocode('서울 도로만', cache, { fetchFn: async () => new Response(JSON.stringify([{ lat: '37.5', lon: '126.9', class: 'highway', addresstype: 'tertiary', address: { road: '효창원로' } }])) }), null);
  assert.match(cache['서울 도로만'].why, /tertiary 수준만 찾음/);   // 번지까지 못 찾으면 쓰지 않음 (정보 없음)
  await E.geocode('서울 A', cache, { fetchFn: async () => { n++; return new Response('[]'); } }); assert.equal(n, 1);
  assert.equal(await E.geocode('서울 B', cache, { fetchFn: async () => new Response('[]') }), null); assert.equal(await E.geocode('서울 B', cache, { fetchFn: async () => { throw new Error('안 불러야 함'); } }), null); });
console.log(`${ok}개 모두 OK`);
