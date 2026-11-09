// 단지 직접 공고 출처 ① 엘리스 (롯데건설 임대 플랫폼 www.elyes.co.kr) 모집공고
// 출처 하나 = 파일 하나. 새 출처는 이 모양(SOURCE · DANJI · parse · fetchList)을 따라 scripts/sources/ 에 더하고 feed.mjs 의 SOURCES 에 넣는다
// · 목록: POST /post/data/recruit/list (폼: i_iNowPageNo · i_iPageSize) — 화면(/post/recruit)이 부르는 것과 같은 주소
// · 저장은 제목 · 게시일 · 상세 링크만. 응답에 같이 오는 본문(nt_content)·첨부·사진은 쓰지 않고 버린다
// · 같은 사이트 3초 간격 · robots.txt 확인 (net.mjs) · 하루 약 4번 (공고 피드와 같이)
import { polite, robotsOk } from '../net.mjs';

export const SOURCE = { id: 'elyes', label: '엘리스', home: 'https://www.elyes.co.kr' };
const LIST = 'https://www.elyes.co.kr/post/data/recruit/list', DETAIL = 'https://www.elyes.co.kr/post/recruit/detail';

// 엘리스 단지 이름(제목 앞 [ ]) → 서울 단지. 여기 없는 이름(부산 하단·양산 사송·동탄·김포 한강 22단지 등 서울 밖)은 버린다 (2026-11-09 사용자 결정)
// name 이 있으면 청년안심주택 101개 목록의 이름 · other 면 '그 밖의 서울 민간임대' (청년안심주택 아님)
export const DANJI = {
  '용산원효루미니': { name: '남영역 용산 원효 루미니' }, '용산 원효 루미니': { name: '남영역 용산 원효 루미니' },
  '남영역 롯데캐슬': { name: '남영역 용산 남영역 롯데캐슬 헤리티지' }, '용산 남영역 롯데캐슬 헤리티지': { name: '남영역 용산 남영역 롯데캐슬 헤리티지' },
  '어바니엘 충정로': { name: '충정로역 어바니엘 위드 더 스타일 충정로' },
  '문래 롯데캐슬': { other: { id: 'x-elyes-mullae', name: '문래 롯데캐슬', gu: '영등포구' } },
  '독산역 롯데캐슬': { other: { id: 'x-elyes-doksan', name: '독산역 롯데캐슬', gu: '금천구' } },
  '어바니엘 가산': { other: { id: 'x-elyes-gasan', name: '어바니엘 가산', gu: '금천구' } },
  '어바니엘 염창': { other: { id: 'x-elyes-yeomchang', name: '어바니엘 염창', gu: '강서구' } },
  '어바니엘 천호': { other: { id: 'x-elyes-cheonho', name: '어바니엘 천호', gu: '강동구', home: 'https://www.elyes.co.kr/complex/detail?pid=cheonho' } },   // 천호대로161길 21
  '어바니엘 한강': { other: { id: 'x-elyes-hankang', name: '어바니엘 한강', gu: '동작구', home: 'https://www.elyes.co.kr/complex/detail?pid=hankang' } },   // 노량진로 190
};
export const OTHERS = Object.values(DANJI).filter(d => d.other).map(d => ({ home: SOURCE.home, ...d.other, kind: '민간임대', src: SOURCE.label }));

const unHtml = s => String(s ?? '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const ymd = s => { const m = String(s).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const pad = n => String(n).padStart(2, '0');
const SKIP = /현황|결과|발표|당첨|계약자|어린이집|상가/;   // 모집공고가 아닌 글
// 사이트가 '마감되었습니다'를 붙인 글: 접수일을 읽을 수 있으면 남김(접수일이 지나면 피드가 뺌 · 접수 당일은 하루 동안 보임) · 못 읽으면 뺌
const CLOSED = /마감되었습니다|\[마감\]/;

// 제목에서 접수 기간 읽기 → { from, to, time } (없으면 null). 공고일은 접수일이 아니라서 쓰지 않는다
//  '접수기간: 11/6~11/8' · "접수: '26.11.13(금) 10~15시" · '모집기간 : 26.11.05~26.11.08' · "접수일 '26.11.09"
//  연도가 없으면 게시일의 연도 · 날짜가 앞 날짜보다 이르면(12/30~1/2) 다음 해 · 게시일보다 6달 넘게 이르면 다음 해
export function titleDates(title, posted) {
  const m = String(title).match(/(접수\s*기간|접수\s*일|접수|모집\s*기간|신청\s*기간|청약\s*기간|청약\s*일|신청\s*일)\s*[:：]?\s*([^\]]*)/); if (!m) return null;
  const ds = [...m[2].matchAll(/(?:[‘'’]?(\d{4}|\d{2})\s*[.]\s*)?(\d{1,2})\s*[./]\s*(\d{1,2})/g)]; if (!ds.length) return null;
  const py = +(posted || '').slice(0, 4) || new Date().getFullYear(), pm = +(posted || '').slice(5, 7) || 1;
  let y = null, prev = null; const out = [];
  for (const d of ds) {
    const mo = +d[2], da = +d[3]; if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    if (d[1]) y = d[1].length === 2 ? 2000 + +d[1] : +d[1];
    else if (y == null) y = mo < pm - 6 ? py + 1 : py;
    else if (prev && mo < prev) y++;
    prev = mo; out.push(`${y}-${pad(mo)}-${pad(da)}`);
  }
  const from = out[0], to = out.at(-1); if (to < from) return null;
  if (posted && (Date.parse(to) - Date.parse(posted) > 150 * 864e5 || Date.parse(posted) - Date.parse(to) > 60 * 864e5)) return null;   // 이상하게 읽힘
  const tm = m[2].match(/~\s*(\d{1,2})\s*시/) || m[2].match(/(\d{1,2}):(\d{2})\s*$/);
  return { from, to, time: tm ? `${pad(tm[1])}:${tm[2] || '00'}` : '' };
}

// 목록 응답 → 피드 공고 (서울 단지만 · 제목·날짜·링크만)
export function parse(data, { unknown = new Set() } = {}) {
  const out = [];
  for (const r of data?.recruitList ?? []) {
    const title = unHtml(r?.nt_title).trim(), posted = ymd(r?.row_input_date), idx = String(r?.nt_idx ?? '');
    if (!title || !idx || !posted || SKIP.test(title)) continue;
    const key = title.match(/^\s*\[([^\]]+)\]/)?.[1].trim(), d = key && DANJI[key];
    if (!d) { if (key) unknown.add(key); continue; }   // 모르는 단지(서울 밖 포함)는 빼고 기록만
    const dt = titleDates(title, posted); if (CLOSED.test(title) && !dt) continue;
    out.push({ feedId: `elyes-${idx.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`, org: '엘리스', title, region: '서울', kind: d.other ? '민간임대' : '청년안심주택(민간)',
      posted, from: dt?.from || '', to: dt?.to || '', time: dt?.time || '', url: `${DETAIL}?i_sNtCode=BHCT&nt_idx=${encodeURIComponent(idx)}`,
      direct: true, closed: CLOSED.test(title), danjiName: d.name || '', danji: d.other?.id || '' });   // closed: 사이트가 '마감되었습니다'를 붙임 → 화면은 '마감됨' · 목록 아래
  }
  return out;
}

export async function fetchList({ pages = 3 } = {}) {   // 한 쪽 10개 · 최근 30개면 하루 4번 보는 데 충분
  const out = [], unknown = new Set();
  for (let p = 1; p <= pages; p++) {
    await robotsOk(LIST);
    let res; try { res = await polite(LIST, { method: 'POST', body: new URLSearchParams({ i_iNowPageNo: String(p), i_iPageSize: '10' }),
      headers: { 'User-Agent': 'Mozilla/5.0 (cheongyak-check feed)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); }
    catch (e) { throw new Error(`엘리스: 연결 실패 (${e?.cause?.code || e?.name || 'network'})`); }
    if (!res.ok) throw new Error(`엘리스: HTTP ${res.status}`);
    let data; try { data = await res.json(); } catch { throw new Error('엘리스: JSON 아님'); }
    if (!Array.isArray(data?.recruitList)) throw new Error('엘리스: 목록 모양이 바뀜');
    out.push(...parse(data, { unknown })); if (p >= Number(data.pagination?.i_iTotalPageCnt ?? 1)) break;
  }
  if (unknown.size) console.log(`엘리스 · 단지 표에 없어 뺀 이름: ${[...unknown].join(', ')} (서울 단지면 scripts/sources/elyes.mjs DANJI 에 추가)`);
  return [...new Map(out.map(i => [i.feedId, i])).values()];
}
