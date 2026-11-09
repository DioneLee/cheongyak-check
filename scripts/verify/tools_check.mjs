// 캘린더(.ics) · 신청 가능 배지 · 필터 · 공고 글 구조화 검사: node scripts/verify/tools_check.mjs (인터넷 안 씀)
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const FT = createRequire(import.meta.url)('../../lib/feed-tools.js');
const E = await import('../enrich.mjs');
let ok = 0; const t = async (n, f) => { await f(); ok++; console.log('OK', n); };

// 더포디엄830: 실제 상세 파일 + 목록 값(청약 11.9~11.10 23:00)
// 게시판 공고 상세는 2026-11-09 부터 만들지 않아 저장소에서 지웠다 → 지우기 전 커밋의 파일을 git 기록에서 읽는다 (저장소에 다시 두지 않음)
const D6720 = JSON.parse(execFileSync('git', ['show', 'fa56eb2:feed/detail/youth-6720.json'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' }));
const I6720 = { id: 'youth-6720', title: '[민간임대] 건대입구역 더포디엄830 추가모집공고', url: 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=6720&menuNo=400008', posted: '2026-11-05', from: '2026-11-09', to: '2026-11-10', time: '23:00', startOnly: false, detail: true };
const ev = E.eventsFor(I6720, D6720), ty = E.typesOf(D6720), cr = E.critsOf(D6720);

await t('일정: 청약 시작 11.9 · 마감 11.10 23:00 · 발표 11.11 17:00 · 서류 11.12~13 · 계약 11.17~20', async () => assert.deepEqual(ev.map(e => [e.k, e.d, e.e || '', e.t || '']), [
  ['start', '2026-11-09', '', ''], ['end', '2026-11-10', '', '23:00'], ['announce', '2026-11-11', '', '17:00'], ['docs', '2026-11-12', '2026-11-13', ''], ['contract', '2026-11-17', '2026-11-20', '']]));
await t('일정: 게시판 본문의 발표 줄(sch)도 발표 일정으로 · 청약 기간은 목록 것 그대로', async () => assert.deepEqual(E.eventsFor({ ...I6720, sch: [{ label: '서류심사 대상자 발표', date: '‘26. 11. 11. (수) 17:00 예정' }] }, null).map(e => [e.k, e.d, e.t || '', e.l]),
  [['start', '2026-11-09', '', '청약 시작'], ['end', '2026-11-10', '23:00', '청약 마감'], ['announce', '2026-11-11', '17:00', '서류심사 대상자 발표']]));
await t('날짜 글 읽기: 여러 모양 (점·월일·오전/오후·24:00·해 넘김)', async () => {
  assert.deepEqual(E.parseWhen('2026. 11. 2. ~ 11. 12. 18시', 2026), { d1: '2026-11-02', d2: '2026-11-12', t1: '', t2: '18:00' });
  assert.deepEqual(E.parseWhen('11월 10일 ~ 11월 17일', 2026), { d1: '2026-11-10', d2: '2026-11-17', t1: '', t2: '' });
  assert.deepEqual(E.parseWhen('2026.11.18 ~ 2026.11.20 오전 10시 ~ 오후 17시', 2026), { d1: '2026-11-18', d2: '2026-11-20', t1: '10:00', t2: '17:00' });
  assert.deepEqual(E.parseWhen('2026.12.30 ~ 01.02 24:00', 2026), { d1: '2026-12-30', d2: '2027-01-02', t1: '', t2: '24:00' });
  assert.equal(E.parseWhen('추후 개별 연락', 2026), null); assert.equal(E.parseWhen('2027년 1월 중', 2026), null); });

const n6720 = { id: 'youth-6720', name: '건대입구역 더포디엄830', url: I6720.url, apply: 'https://naver.me/GUTJuhOO', ev };
const ics1 = FT.ics([n6720]), ics2 = FT.ics([n6720]);
const vevent = (s, uid) => s.replace(/\r\n /g, '').split('BEGIN:VEVENT').find(b => b.includes(`UID:${uid}`));
await t('.ics: 청약 기간 11.9~11.10 한 일정(하루 종일, 마감 시각은 제목) + 알림 2개(하루 전 09:00 · 3시간 전)', async () => {
  const e = vevent(ics1, 'youth-6720-end@dionelee.github.io'); assert.ok(e);
  assert.match(e, /DTSTART;VALUE=DATE:20261109\r\nDTEND;VALUE=DATE:20261111\r\n/); assert.match(e, /SUMMARY:\[청약\] 건대입구역 더포디엄830 · 청약 기간 \(11\/10 23:00 마감\)/);
  assert.equal((e.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.match(e, /TRIGGER;VALUE=DATE-TIME:20261109T000000Z/); assert.match(e, /TRIGGER;VALUE=DATE-TIME:20261110T110000Z/);   // 11.9 09:00 KST · 11.10 20:00 KST
  assert.match(e, /DESCRIPTION:.*공고 원문: https:\/\/soco\.seoul\.go\.kr.*\\n신청: https:\/\/naver\.me\/GUTJuhOO/); });
await t('.ics: 시작일을 모르는 마감은 따로 — 마감 2026-11-10 23:00(Asia/Seoul) 1시간 일정', async () => {
  const e = vevent(FT.ics([{ ...n6720, ev: [ev[1]] }]).replace(/\r\n /g, ''), 'youth-6720-end@dionelee.github.io');
  assert.match(e, /DTEND;TZID=Asia\/Seoul:20261110T230000\r\n/); assert.match(e, /SUMMARY:\[청약\] 건대입구역 더포디엄830 · 청약 마감 \(23:00까지\)/); assert.equal((e.match(/BEGIN:VALARM/g) || []).length, 2); });
await t('.ics: 발표 일정 제목은 공고의 이름 그대로 (서류심사 대상자 발표)', async () => {
  const e = vevent(FT.ics([{ ...n6720, ev: [{ k: 'announce', l: '서류심사 대상자 발표', d: '2026-11-11', t: '17:00' }] }]).replace(/\r\n /g, ''), 'youth-6720-announce@dionelee.github.io');
  assert.match(e, /DTSTART;TZID=Asia\/Seoul:20261111T170000\r\n/); assert.match(e, /SUMMARY:\[청약\] 건대입구역 더포디엄830 · 서류심사 대상자 발표\r\n/); });
await t('.ics: 같은 공고로 다시 만들면 UID 가 같음 (캘린더에서 갱신)', async () => {
  const uids = s => [...s.replace(/\r\n /g, '').matchAll(/^UID:(.+)$/gm)].map(m => m[1].trim());
  assert.deepEqual(uids(ics1), uids(ics2)); assert.deepEqual(uids(ics1), ['youth-6720-end@dionelee.github.io', 'youth-6720-announce@dionelee.github.io', 'youth-6720-docs@dionelee.github.io', 'youth-6720-contract@dionelee.github.io']); });
await t('.ics: RFC 5545 형식 — 모든 줄 CRLF · 75바이트 이하 · 접은 줄은 공백으로 시작 · VCALENDAR/VTIMEZONE · 하루 종일은 VALUE=DATE', async () => {
  assert.ok(ics1.endsWith('\r\n')); assert.ok(!/[^\r]\n/.test(ics1), 'LF 만 있는 줄');
  const lines = ics1.split('\r\n').slice(0, -1); for (const l of lines) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `${Buffer.byteLength(l)}바이트: ${l}`);
  assert.ok(lines.some(l => l.startsWith(' ')), '긴 줄이 접혀 있어야 함'); assert.equal(lines[0], 'BEGIN:VCALENDAR'); assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes('VERSION:2.0') && lines.includes('TZID:Asia/Seoul')); assert.ok(lines.includes('DTSTART;VALUE=DATE:20261117') && lines.includes('DTEND;VALUE=DATE:20261121'));
  const unfolded = ics1.replace(/\r\n /g, ''); assert.match(unfolded, /SUMMARY:\[청약\] 건대입구역 더포디엄830 · 청약 기간 \(11\/10 23:00 마감\)\r\n/);   // 접었다 펴도 글자 그대로
  assert.equal((ics1.match(/BEGIN:VEVENT/g) || []).length, (ics1.match(/END:VEVENT/g) || []).length); });
await t('.ics: SEQUENCE(기본 0, 바뀐 일정은 그 수 · 청약 기간은 시작+마감+1 — 예전 마감 일정보다 커서 덮어씀) · LAST-MODIFIED(상세 읽은 시각 → UTC) · DTSTAMP(만든 시각 UTC)', async () => {
  const s = FT.ics([{ ...n6720, lm: '2026-11-07 18:41', ev: [{ ...ev[0] }, { ...ev[1], q: 2 }] }]).replace(/\r\n /g, '');
  assert.equal(vevent(s, 'youth-6720-start@dionelee.github.io'), undefined); assert.match(vevent(s, 'youth-6720-end@dionelee.github.io'), /SEQUENCE:3\r\n/);
  assert.match(vevent(FT.ics([{ ...n6720, ev: [{ ...ev[1], q: 2 }] }]).replace(/\r\n /g, ''), 'youth-6720-end@dionelee.github.io'), /SEQUENCE:2\r\n/);
  assert.match(s, /LAST-MODIFIED:20261107T094100Z/); const st = s.match(/DTSTAMP:(\d{8}T\d{6}Z)/)[1]; assert.ok(Math.abs(Date.parse(st.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, '$1-$2-$3T$4:$5:$6Z')) - Date.now()) < 6e4); });
await t('.ics: 시각 없는 마감은 하루 종일 · 알림은 전날 09:00 · 그날 21:00', async () => {
  const s = FT.ics([{ id: 'x-1', name: 'A', ev: [{ k: 'end', d: '2026-11-13' }] }]).replace(/\r\n /g, '');
  assert.match(s, /DTSTART;VALUE=DATE:20261113/); assert.match(s, /TRIGGER;VALUE=DATE-TIME:20261112T000000Z/); assert.match(s, /TRIGGER;VALUE=DATE-TIME:20261113T120000Z/); });
await t('구독 캘린더는 청약 기간·발표만 (서류·계약 빼고) · 같은 DTSTAMP 면 같은 글자', async () => {
  const K = ['start', 'end', 'announce'], s = FT.ics([n6720], { kinds: K, dtstamp: () => '20261105T000000Z', refresh: 'PT3H' });
  assert.deepEqual([...s.matchAll(/^UID:(.+)$/gm)].map(m => m[1].trim()), ['youth-6720-end@dionelee.github.io', 'youth-6720-announce@dionelee.github.io']); assert.match(s, /REFRESH-INTERVAL;VALUE=DURATION:PT3H/); assert.equal(s, FT.ics([n6720], { kinds: K, dtstamp: () => '20261105T000000Z', refresh: 'PT3H' })); });

// 신청 가능 배지 (내 조건 × 자격 기준) · SEEN: 사용자가 직접 넣거나 확인한 칸
const SEEN = { hasCar: true };
const today = '2026-11-08';
const me = { a: { birth: '1997-03-01', income: 300 }, b: {}, nw: {}, yt: { single: true, homeless: true, house: 'alone', asset: 5000 }, hasCar: false, car: null, live: { city: '서울' }, work: {} };
await t('자격 기준 읽기 (더포디엄830): 나이 19~39 · 세대 무주택 · 자동차 4,542만원', async () => assert.deepEqual(cr.c, [{ k: 'age', min: 19, max: 39 }, { k: 'homeless', scope: '세대' }, { k: 'car', max: 4542 }]));
await t('배지: 정보가 다 있고 모두 통과 → 가능', async () => { const r = FT.judge(me, cr, { tier: 'youth', today, seen: SEEN }); assert.equal(r.st, 'ok', JSON.stringify(r.why));
  assert.deepEqual(r.why.filter(w => !w.extra).map(w => [w.ok, w.t, w.v]), [[true, '나이 만 19~39세', '만 29세'], [true, '세대원 모두 무주택', '무주택'], [true, '자동차가액 4,542만원 이하', '자동차 없음']]); });
const crInc = { c: [...cr.c, { k: 'income', pct: 100, amt: { 1: 458 } }], x: 0 };
await t('배지: 소득 기준이 있는데 소득 미입력 → 확인 필요 (이유: 입력 안 함)', async () => {
  assert.equal(FT.judge(me, crInc, { tier: 'youth', today, seen: SEEN }).st, 'ok');
  const r = FT.judge({ ...me, a: { birth: me.a.birth, income: null } }, crInc, { tier: 'youth', today, seen: SEEN }); assert.equal(r.st, 'unk'); assert.deepEqual(r.why.find(w => w.t.startsWith('월평균소득')), { ok: null, t: '월평균소득 100% 이하', v: '입력 안 함' }); });
await t('배지: 나이 초과 → 어려움', async () => { const r = FT.judge({ ...me, a: { birth: '1980-01-01', income: 300 } }, cr, { tier: 'youth', today, seen: SEEN }); assert.equal(r.st, 'no'); assert.deepEqual(r.why[0], { ok: false, t: '나이 만 19~39세', v: '만 46세' }); });
await t('배지: 자동차 있음인데 가액 미입력 → 확인 필요 "입력 안 함"', async () => { const r = FT.judge({ ...me, hasCar: true }, cr, { tier: 'youth', today, seen: SEEN }); assert.equal(r.st, 'unk'); assert.deepEqual(r.why[2], { ok: null, t: '자동차가액 4,542만원 이하', v: '입력 안 함' }); });
await t('배지: 기본값(자동차 없음)을 확인하지 않았으면 그 항목은 입력 안 함 → 확인 필요', async () => {
  const r = FT.judge(me, cr, { tier: 'youth', today, seen: {} }); assert.equal(r.st, 'unk'); assert.deepEqual(r.why[2], { ok: null, t: '자동차가액 4,542만원 이하', v: '입력 안 함' }); });
await t('배지: 수락(sh-312351) 기준 — 소득·자산 미입력이면 확인 필요 (기본값으로 통과시키지 않음)', async () => {
  const c351 = { c: [{ k: 'age', min: 19, max: null }, { k: 'homeless', scope: '본인' }, { k: 'region', work: true, cond: true }, { k: 'car', max: 4542 }, { k: 'asset', by: { all: 34500, youth: 25100 } }, { k: 'income', pct: 120, amt: { 1: 458, 2: 704, 3: 980 } }], x: 1 };
  const def = { a: { birth: '1997-03-01', income: null }, b: { birth: '', income: null }, hasCar: false, car: null, live: { city: '서울', gu: '' }, work: { city: '', gu: '' }, nw: { appl: 'a', homeless: null, others: 0, kids: 0, asset: null }, yt: { single: true, homeless: true, house: 'alone', hh: 2, hhIncome: null, asset: null } };
  const r = FT.judge(def, c351, { tier: 'youth', today, seen: {} }); assert.equal(r.st, 'unk');
  assert.deepEqual(r.why.filter(w => w.ok == null && !w.extra).map(w => [w.t, w.v]), [['자동차가액 4,542만원 이하', '입력 안 함'], ['총자산 2억 5,100만원 이하 (청년)', '입력 안 함'], ['월평균소득 120% 이하', '입력 안 함']]);
  assert.equal(FT.judge({ ...def, a: { ...def.a, income: 300 }, yt: { ...def.yt, asset: 5000 } }, c351, { tier: 'youth', today, seen: { hasCar: true } }).st, 'ok'); });
await t('배지: 신혼부부 소득은 자녀 수를 확인해야 가구원 수를 앎', async () => {
  const c = { c: [{ k: 'income', pct: 120, amt: { 2: 700 } }], x: 0 }, nwMe = { a: { income: 300 }, b: { income: 300 }, nw: { kids: 0, others: 0 } };
  assert.equal(FT.judge(nwMe, c, { tier: 'newlywed', today, seen: {} }).why[0].v, '가구원 수 입력 안 함'); assert.equal(FT.judge(nwMe, c, { tier: 'newlywed', today, seen: { 'nw.kids': true } }).st, 'ok'); });
await t('배지: 자격 기준이 구조화돼 있지 않은 공고 → 확인 필요 (판정 안 함)', async () => { assert.equal(FT.judge(me, null, { tier: 'youth', today, seen: SEEN }).st, 'unk'); assert.equal(FT.judge(me, { c: [], x: 3 }, { tier: 'youth', today, seen: SEEN }).st, 'unk'); });
await t('배지: 조건부 기준(소득 50% 이하만 해당 등)을 넘으면 어려움이 아니라 확인 필요', async () => {
  assert.equal(FT.judge({ ...me, yt: { ...me.yt, asset: 30000 } }, { c: [{ k: 'asset', max: 24500, cond: true }], x: 0 }, { tier: 'youth', today, seen: SEEN }).st, 'unk');
  assert.equal(FT.judge({ ...me, yt: { ...me.yt, asset: 30000 } }, { c: [{ k: 'asset', max: 24500 }], x: 0 }, { tier: 'youth', today, seen: SEEN }).st, 'no'); });

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
// SEQUENCE: 마감 시각이 바뀌면 +1 (상세 파일 seq 에 기록) · 역: 본문 거리 > 번지 좌표 > 역 이름만
{ const dd = await mkdtemp(join(tmpdir(), 'enr-')) + '/', geoFile = dd + 'geo.json', stF = dd + 'st.json', noFetch = async () => { throw new Error('부르면 안 됨'); };
  await writeFile(stF, JSON.stringify({ stations: { 건대입구역: [37.54044, 127.07086], 효창공원앞역: [37.53934, 126.96133] } }));
  await writeFile(dd + 'youth-6720.json', JSON.stringify({ ...D6720, seq: undefined, near: { n: '건대입구역', exit: '6' }, addr: '서울특별시 광진구 아차산로 212' }));
  await writeFile(geoFile, JSON.stringify({ '서울특별시 광진구 아차산로 212': { ll: [37.53872, 127.07436] } }));
  const items = () => [{ ...I6720 }]; let L = items(); await E.enrich(L, { dir: dd, geoFile, stationsFile: stF, fetchFn: noFetch, log: () => {} });
  await t('SEQUENCE: 처음은 0 · 상세 파일 seq 에 날짜·시각 기록', async () => { assert.equal(L[0].ev.find(e => e.k === 'end').q, undefined); const d = JSON.parse(await readFile(dd + 'youth-6720.json', 'utf8')); assert.deepEqual(d.seq.end, { n: 0, s: '2026-11-10||23:00' }); assert.match(L[0].dv, /^[0-9a-f]{10}$/); });
  L = [{ ...I6720, time: '18:00' }]; await E.enrich(L, { dir: dd, geoFile, stationsFile: stF, fetchFn: noFetch, log: () => {} });
  await t('SEQUENCE: 마감 시각이 23:00 → 18:00 으로 바뀌면 1 · .ics 청약 기간은 SEQUENCE:2 (마감 1 + 시작 0 + 1)', async () => { assert.equal(L[0].ev.find(e => e.k === 'end').q, 1); assert.equal(L[0].ev.find(e => e.k === 'start').q, undefined);
    assert.match(FT.ics([{ id: 'youth-6720', name: 'x', ev: L[0].ev }]).replace(/\r\n /g, ''), /UID:youth-6720-end@dionelee\.github\.io\r\nDTSTAMP:\d{8}T\d{6}Z\r\nSEQUENCE:2\r\n/); });
  L = [{ ...I6720, time: '18:00' }]; await E.enrich(L, { dir: dd, geoFile, stationsFile: stF, fetchFn: noFetch, log: () => {} });
  await t('SEQUENCE: 그대로면 안 올라감 · LAST-MODIFIED 용 lm = 상세 readAt', async () => { assert.equal(L[0].ev.find(e => e.k === 'end').q, 1); assert.equal(L[0].lm, D6720.readAt); });
  await t('역: 본문 역이 있고 번지 좌표가 있으면 그 역까지 직선거리 (src geo)', async () => { assert.equal(L[0].st.n, '건대입구역'); assert.equal(L[0].st.src, 'geo'); assert.ok(L[0].st.m > 250 && L[0].st.m < 450); assert.equal(L[0].st.exit, '6'); });
  await writeFile(dd + 'youth-6718.json', JSON.stringify({ ...D6720, id: 'youth-6718', addr: '서울특별시 용산구 효창원로 80', near: { n: '효창공원앞역', exit: '3', w: 4, m: 280 } }));
  await writeFile(dd + 'youth-6721.json', JSON.stringify({ ...D6720, id: 'youth-6721', addr: null, near: { n: '미아사거리역', exit: '3', alt: '숭곡초교역' } }));
  L = [{ ...I6720, id: 'youth-6718' }, { ...I6720, id: 'youth-6721' }, { ...I6720, id: 'sh-1', detail: false, title: '[청년] 숭곡초교역(예정) 앞 공고' }]; await E.enrich(L, { dir: dd, geoFile, stationsFile: stF, fetchFn: async () => new Response('[]'), log: () => {} });
  await t('역: 본문에 거리가 있으면 그 값 (src text) · 없으면 역 이름만 (거리 null) · (예정)은 pre', async () => {
    assert.deepEqual(L[0].st, { n: '효창공원앞역', m: 280, w: 4, src: 'text', exit: '3' });
    assert.deepEqual(L[1].st, { n: '미아사거리역', m: null, w: null, src: 'name', exit: '3', alt: '숭곡초교역' });
    assert.deepEqual(L[2].st, { n: '숭곡초교역', m: null, w: null, src: 'name', pre: true }); });
  await t('필터: 역 이름만(거리 없음)이면 정보 없음', async () => assert.equal(FT.filterItem({ ty: [], st: L[1].st }, { walk: 10 }).st, 'unk'));
  const cf = dd + 'cal.ics', it1 = [{ ...I6720, ev, lm: '' }];
  await t('구독 캘린더: DTSTAMP = 만든 시각 · 일정이 그대로면 다시 쓰지 않음 · 바뀌면 씀', async () => {
    assert.equal(await E.writeCalendar(it1, cf, new Date('2026-11-08T12:00:00Z')), true); assert.match(await readFile(cf, 'utf8'), /DTSTAMP:20261108T120000Z/);
    assert.equal(await E.writeCalendar(it1, cf, new Date('2026-11-08T15:00:00Z')), false); assert.match(await readFile(cf, 'utf8'), /DTSTAMP:20261108T120000Z/);
    assert.equal(await E.writeCalendar([{ ...it1[0], ev: ev.map(e => e.k === 'end' ? { ...e, t: '18:00' } : e) }], cf, new Date('2026-11-08T16:00:00Z')), true); });
  await t('구독 캘린더: 마감됨(closed) 단지 직접 공고는 빼고 · 단지 직접 공고 제목은 [단지 이름]을 남김', async () => {
    const e1 = [{ k: 'end', d: '2026-11-13', t: '15:00' }];
    await E.writeCalendar([{ id: 'elyes-a', title: "[독산역 롯데캐슬] 신혼부부특별공급세대 재임대 모집공고(접수: '26.11.13)", direct: true, url: '', lm: '', ev: e1 },
      { id: 'elyes-b', title: "[용산원효루미니] 추가모집공고(접수일 '26.11.09)-->마감되었습니다.", direct: true, closed: true, url: '', lm: '', ev: [{ k: 'end', d: '2026-11-09' }] }], cf, new Date('2026-11-09T12:00:00Z'));
    const s = (await readFile(cf, 'utf8')).replace(/\r\n /g, ''); assert.ok(!s.includes('elyes-b')); assert.match(s, /SUMMARY:\[청약\] 독산역 롯데캐슬 신혼부부특별공급세대 재임대 · 청약 마감 \(15:00까지\)\r\n/);
    assert.equal(FT.calName('[민간임대] 건대입구역 더포디엄830 추가모집공고'), '건대입구역 더포디엄830'); assert.equal(FT.calName('[남영역 롯데캐슬] 남영역 롯데캐슬 공실세대 모집공고', true), '남영역 롯데캐슬 공실세대'); });
  await rm(dd, { recursive: true }); }
await t('역 이름·거리 문구 읽기: 출구 · 도보 · 직선거리 · (예정) · 역세권·지역은 무시', async () => {
  assert.deepEqual(E.nearFrom('[민간임대] 숭곡초교역(예정) 성북펠릭스', '■주택위치 : 서울 성북구 하월곡동 88-222 (4호선 미아사거리역 3번 출구)', { 미아사거리역: [0, 0] }), { n: '미아사거리역', exit: '3', alt: '숭곡초교역' });
  assert.deepEqual(E.nearFrom('효창공원앞역 해링턴', '■교통 : 효창공원앞역 도보 4분, 직선거리 280m', { 효창공원앞역: [0, 0] }), { n: '효창공원앞역', w: 4, m: 280 });
  assert.equal(E.nearFrom('역세권 지역 구역 공고', '역세권 단지', { 건대입구역: [0, 0] }), null); });
console.log(`${ok}개 모두 OK`);
