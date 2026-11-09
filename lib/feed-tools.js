// 청약 체크 공고 도구 — 브라우저(index.html, window.FeedTools)와 Actions(scripts/*.mjs, import)에서 함께 쓴다
// · ics: 공고 일정 → iCalendar(RFC 5545) 글자 (Asia/Seoul · 마감 알림 2개 · 고정 UID · 75바이트 줄 접기 · CRLF)
// · judge: 브라우저에 저장된 내 조건 × 공고 자격 기준(cr) → 가능 / 확인 필요 / 어려움 + 항목별 이유 (브라우저 안에서만 계산 · 서버로 안 보냄)
// · filter: 보증금·월세·면적·역 거리 조건 → 맞음 / 정보 없음 / 안 맞음 + 맞는 주택형 번호
(function (root, make) { const T = make(); if (typeof module === 'object' && module.exports) module.exports = T; else root.FeedTools = T; })(typeof self !== 'undefined' ? self : this, function () {
  const DOMAIN = 'dionelee.github.io', TZ = 'Asia/Seoul';
  const KIND = { start: '청약 시작', end: '청약 마감', announce: '발표', docs: '서류 제출', contract: '계약' };

  // ---------- ics ----------
  const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, bytes = s => enc ? enc.encode(s).length : Buffer.byteLength(s, 'utf8');
  function fold(line) {   // 75바이트(UTF-8)마다 CRLF + 공백 · 글자 중간에서 자르지 않는다
    if (bytes(line) <= 75) return line;
    const out = []; let cur = '', limit = 75;
    for (const ch of line) { if (bytes(cur + ch) > limit) { out.push(cur); cur = ch; limit = 74; } else cur += ch; }
    out.push(cur); return out.join('\r\n ');
  }
  const ymd = d => d.replace(/-/g, '');
  const addDays = (d, n) => { const t = new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5); return t.toISOString().slice(0, 10); };
  // '24:00' → 다음 날 00:00
  const at = (d, t) => { const [h, m] = t.split(':').map(Number); return h >= 24 ? { d: addDays(d, 1), t: `${String(h - 24).padStart(2, '0')}:${String(m).padStart(2, '0')}` } : { d, t: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }; };
  const local = (d, t) => `${ymd(d)}T${t.replace(':', '')}00`;
  const utcOf = (d, t, minusMin = 0) => { const ms = Date.parse(`${d}T${t}:00+09:00`) - minusMin * 6e4; return new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; };
  const stamp = d => (d ? new Date(d) : new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  // ev: { k: start|end|announce|docs|contract, l: 원래 이름, d: 'YYYY-MM-DD', e?: 끝 날짜(여러 날), t?: 'HH:MM' }
  function eventLines(n, ev, i, opt = {}) {
    const name = n.name || n.title || '공고', kind = ev.from ? '청약 기간' : ev.k === 'announce' && ev.l ? ev.l : KIND[ev.k] || ev.l || '일정', uid = `${n.id}-${ev.k}${i ? `-${i}` : ''}@${DOMAIN}`;
    const links = [n.url && `공고 원문: ${n.url}`, n.apply && `신청: ${n.apply}`].filter(Boolean).join('\n');
    const L = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${opt.dtstamp || stamp()}`, `SEQUENCE:${Number.isInteger(ev.q) ? ev.q : 0}`];   // SEQUENCE: 날짜·시각이 바뀔 때마다 +1 (Actions 가 상세 파일에 기록)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(n.lm || '')) L.push(`LAST-MODIFIED:${utcOf(n.lm.slice(0, 10), n.lm.slice(11))}`);   // 상세를 읽은 시각(서울) → UTC
    if (ev.from) L.push(`DTSTART;VALUE=DATE:${ymd(ev.from)}`, `DTEND;VALUE=DATE:${ymd(addDays(ev.d, 1))}`);   // 청약 기간: 시작일 ~ 마감일 하루 종일 (마감 시각은 제목에)
    else if (ev.t) {
      const s = at(ev.d, ev.t);
      if (ev.k === 'end') { const b = shift(s.d, s.t, -60); L.push(`DTSTART;TZID=${TZ}:${local(b.d, b.t)}`, `DTEND;TZID=${TZ}:${local(s.d, s.t)}`); }   // 마감: 마감 1시간 전 ~ 마감 시각
      else { const e = shift(s.d, s.t, 60); L.push(`DTSTART;TZID=${TZ}:${local(s.d, s.t)}`, `DTEND;TZID=${TZ}:${local(e.d, e.t)}`); }   // 시각이 있는 일정: 1시간짜리
    } else L.push(`DTSTART;VALUE=DATE:${ymd(ev.d)}`, `DTEND;VALUE=DATE:${ymd(addDays(ev.e || ev.d, 1))}`);
    const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
    L.push(`SUMMARY:${esc(`[청약] ${name} · ${kind}${ev.from ? ` (${md(ev.d)}${ev.t ? ` ${ev.t}` : ''} 마감)` : ev.k === 'end' && ev.t ? ` (${ev.t}까지)` : ''}`)}`);
    if (links || ev.l) L.push(`DESCRIPTION:${esc([ev.l && `일정: ${ev.l}`, links].filter(Boolean).join('\n'))}`);
    if (n.url) L.push(`URL:${n.url}`);
    if (ev.k === 'end') {   // 알림 2개: 하루 전 오전 9시 · 마감 3시간 전 (시각이 없으면 그날 24:00 마감으로 봄)
      const due = ev.t ? at(ev.d, ev.t) : { d: addDays(ev.d, 1), t: '00:00' };
      const dayBefore = addDays(ev.t ? due.d : ev.d, -1);
      for (const [trig, what] of [[utcOf(dayBefore, '09:00'), '내일 청약 마감'], [utcOf(due.d, due.t, 180), '3시간 뒤 청약 마감']])
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${what} · ${name}`)}`, `TRIGGER;VALUE=DATE-TIME:${trig}`, 'END:VALARM');
    }
    L.push('END:VEVENT'); return L;
  }
  const shift = (d, t, min) => { const x = new Date(Date.parse(`${d}T${t}:00Z`) + min * 6e4).toISOString(); return { d: x.slice(0, 10), t: x.slice(11, 16) }; };   // 서울 시각 그대로 분만 더함
  // 청약 시작·마감이 둘 다 있으면 한 일정(청약 기간)으로: UID 는 마감 것을 이어 쓰고(알림도 그대로) SEQUENCE 는 예전 시작·마감 것보다 크게
  function merge(evs) {
    const s = evs.find(e => e.k === 'start'), e = evs.find(x => x.k === 'end');
    if (!s || !e || s.d >= e.d) return evs;
    return evs.filter(x => x !== s).map(x => x === e ? { ...e, from: s.d, l: `청약 ${s.d} ~ ${e.d}${e.t ? ` ${e.t}` : ''}`, q: (e.q || 0) + (s.q || 0) + 1 } : x);
  }
  // notices: [{ id, name|title, url, apply?, ev: [...] }] · kinds: 넣을 일정 종류 (구독 캘린더는 청약 기간·발표)
  function ics(notices, { calName = '청약 체크', kinds = null, dtstamp = null, refresh = null } = {}) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//cheongyak-check//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(calName)}`, `X-WR-TIMEZONE:${TZ}`];
    if (refresh) L.push(`REFRESH-INTERVAL;VALUE=DURATION:${refresh}`, `X-PUBLISHED-TTL:${refresh}`);
    L.push('BEGIN:VTIMEZONE', `TZID:${TZ}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE');
    for (const n of notices) { const seen = {}; for (const ev of merge((n.ev || []).filter(x => !kinds || kinds.includes(x.k)))) { const i = seen[ev.k] = (seen[ev.k] ?? -1) + 1; L.push(...eventLines(n, ev, i, { dtstamp: dtstamp && dtstamp(n, ev) })); } }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  // ---------- judge (내 조건 × 자격 기준) ----------
  const ageOn = (birth, today) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null; const [y, m, d] = birth.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number); return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0); };
  const won = v => v >= 1e4 ? `${Math.floor(v / 1e4)}억${v % 1e4 ? ` ${Math.round(v % 1e4).toLocaleString('ko-KR')}만` : ''}원` : `${Number(v).toLocaleString('ko-KR')}만원`;   // 25100 → '2억 5,100만원'
  const num = v => (v === '' || v == null || !isFinite(v)) ? null : Number(v);
  // me: 청약 진단 입력(state.subs.me) · tier: 'youth' | 'newlywed' · seen: 내가 직접 넣거나 확인한 칸 { 'hasCar': true, … }
  // 기본값(자동차 없음 · 자녀 0명 등)은 seen 에 있을 때만 입력으로 본다 — 안 그러면 '입력 안 함'
  function judge(me, cr, { tier = 'youth', today, seen = {} } = {}) {
    if (!cr || !Array.isArray(cr.c) || !cr.c.length) return { st: 'unk', why: [{ ok: null, t: '자격 기준', v: '공고문 글로만 있어 판정하지 않아요 (공고 원문에서 확인)' }] };
    const nw = tier === 'newlywed', who = nw ? (me?.nw?.appl === 'b' ? me?.b : me?.a) : me?.a, why = [];
    for (const c of cr.c) {
      let ok = null, t = '', v = '';
      if (c.k === 'age') { t = `나이 ${c.min != null ? `만 ${c.min}` : ''}~${c.max != null ? `${c.max}세` : ''}`.replace(/~$/, '세 이상').replace(/^나이 ~/, '나이 '); const a = ageOn(who?.birth, today);
        if (a == null) v = '입력 안 함'; else { ok = (c.min == null || a >= c.min) && (c.max == null || a <= c.max); v = `만 ${a}세`; } }
      else if (c.k === 'homeless') { t = c.scope === '세대' ? '세대원 모두 무주택' : '무주택'; const h = nw ? me?.nw?.homeless : me?.yt?.homeless; ok = h == null ? null : !!h; v = h == null ? '입력 안 함' : h ? '무주택' : '집 있음'; }
      else if (c.k === 'single') { t = '미혼'; if (nw) { ok = false; v = '신혼부부로 입력함'; } else { const s = me?.yt?.single; ok = s == null ? null : !!s; v = s == null ? '입력 안 함' : s ? '미혼' : '기혼'; } }
      else if (c.k === 'region') { t = c.work ? '서울 거주 (또는 서울 직장·학교)' : '서울 거주'; const lc = me?.live?.city, wc = me?.work?.city;
        if (!lc && !(c.work && wc)) v = '입력 안 함'; else { ok = lc === '서울' || (c.work && wc === '서울'); v = `사는 곳 ${lc || '-'}${c.work ? ` · 직장 ${wc || '-'}` : ''}`; if (!ok && c.cond) ok = null; } }
      else if (c.k === 'car') { t = c.max ? `자동차가액 ${won(c.max)} 이하` : '자동차 없음';
        if (me?.hasCar === true) { const cv = num(me?.car); if (cv == null) v = '입력 안 함'; else { ok = cv <= (c.max || 0); v = won(cv); if (!ok && c.cond) ok = null; } }
        else if (me?.hasCar === false && seen.hasCar) { ok = true; v = '자동차 없음'; } else v = '입력 안 함'; }   // '자동차 없음'은 기본값이라 확인했을 때만
      else if (c.k === 'asset') { const lim = c.by ? (c.by[tier] ?? c.by.all) : c.max; t = lim != null ? `총자산 ${won(lim)} 이하${c.by ? ` (${nw ? '신혼부부' : '청년'})` : ''}` : '총자산 기준';
        const av = num(nw ? me?.nw?.asset : me?.yt?.asset); if (lim == null) v = '내 유형 기준은 공고 원문에서'; else if (av == null) v = '입력 안 함'; else { ok = av <= lim; v = won(av); if (!ok && c.cond) ok = null; } }
      else if (c.k === 'income') { t = `월평균소득 ${c.pct ? `${c.pct}%` : '기준'} 이하`;
        const size = nw ? (seen['nw.kids'] || num(me?.nw?.kids) > 0 ? 2 + (num(me?.nw?.kids) || 0) : null) : me?.yt?.house === 'family' ? (seen['yt.hh'] ? num(me?.yt?.hh) : null) : me?.yt?.house === 'none' ? null : 1;
        const inc = nw ? (num(me?.a?.income) == null || num(me?.b?.income) == null ? null : num(me.a.income) + num(me.b.income) + (num(me?.nw?.others) || 0)) : me?.yt?.house === 'family' ? num(me?.yt?.hhIncome) : me?.yt?.house === 'none' ? null : num(me?.a?.income);
        const lim = size != null && c.amt ? c.amt[String(size)] : null;
        if (inc == null) v = '입력 안 함'; else if (size == null) v = '가구원 수 입력 안 함'; else if (lim == null) v = `${size}인 가구 기준 금액은 공고 원문에서`; else { ok = inc <= lim; v = `월 ${inc.toLocaleString('ko-KR')}만원 (${size}인 기준 ${lim.toLocaleString('ko-KR')}만원)`; if (!ok && c.cond) ok = null; } }
      else continue;
      if (c.cond && ok !== true) v += ' · 조건에 따라 달라요';
      why.push({ ok, t, v });
    }
    if (cr.x) why.push({ ok: null, t: `기타 조건 ${cr.x}개`, v: '공고 원문에서 확인 (판정에 넣지 않음)', extra: true });
    const core = why.filter(w => !w.extra);
    const st = core.some(w => w.ok === false) ? 'no' : core.some(w => w.ok == null) || !core.length ? 'unk' : 'ok';
    return { st, why };
  }

  // ---------- filter (보증금·월세·면적·역 거리) ----------
  // item.ty: [{ n, a: 면적㎡, dep: 보증금 만원(범위면 최소), rent: 월세 만원(범위면 최소) }] (상세 supply 와 같은 순서) · item.st: { n: 역, m: 거리m, w: 도보 분 } | null
  // f: { dep, rent, area, walk } (없으면 null) → { st: 'ok'|'unk'|'no'|'all', hits: [주택형 번호] }
  function filterItem(item, f = {}) {
    const on = ['dep', 'rent', 'area', 'walk'].filter(k => f[k] != null && f[k] !== '');
    if (!on.length) return { st: 'all', hits: [] };
    const rowKeys = on.filter(k => k !== 'walk'), rows = Array.isArray(item.ty) ? item.ty : [];
    let walk = 'ok'; if (on.includes('walk')) walk = item.st?.w == null ? 'unk' : item.st.w <= Number(f.walk) ? 'ok' : 'no';
    if (walk === 'no') return { st: 'no', hits: [] };
    if (!rowKeys.length) return { st: walk, hits: [] };
    if (!rows.length) return { st: 'unk', hits: [] };
    const rowSt = r => { let unk = false; for (const k of rowKeys) { const v = k === 'area' ? r.a : r[k]; if (v == null) { unk = true; continue; } if (k === 'area' ? v < Number(f.area) : v > Number(f[k])) return 'no'; } return unk ? 'unk' : 'ok'; };
    const st = rows.map(rowSt), hits = st.map((s, i) => s === 'ok' ? i : -1).filter(i => i >= 0);
    if (hits.length) return { st: walk === 'unk' ? 'unk' : 'ok', hits };
    return { st: st.includes('unk') ? 'unk' : 'no', hits: [] };
  }

  return { ics, fold, judge, filterItem, ageOn, KIND };
});
