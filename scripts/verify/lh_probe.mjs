// LH 분양임대공고문 API 진단 (Actions 에서 수동 실행: 공고 피드 → Run workflow → probe 체크)
// 요청 조건을 바꿔 가며 건수와 공개 필드(공고 이름·지역·상태·날짜)만 찍는다. 키는 찍지 않는다.
import { getJson, todayKst, scrub } from '../feed.mjs';
const URL_ = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
const dot = s => s.replaceAll('-', '.'), ymd8 = s => s.replaceAll('-', '');
const base = { PG_SZ: '100', PAGE: '1' };
const V = {
  '지금 조건': t => ({ ...base, UPP_AIS_TP_CD: t, CNP_CD: '11', PAN_ST_DT: ymd8(todayKst(-90)), PAN_ED_DT: ymd8(todayKst()), PAN_NT_ST_DT: dot(todayKst(-90)), CLSG_DT: dot(todayKst(365)) }),
  'CLSG_DT·PAN_NT_ST_DT 뺌': t => ({ ...base, UPP_AIS_TP_CD: t, CNP_CD: '11', PAN_ST_DT: ymd8(todayKst(-90)), PAN_ED_DT: ymd8(todayKst()) }),
  '날짜 점 표기': t => ({ ...base, UPP_AIS_TP_CD: t, CNP_CD: '11', PAN_ST_DT: dot(todayKst(-90)), PAN_ED_DT: dot(todayKst()) }),
  '지역 조건 뺌': t => ({ ...base, UPP_AIS_TP_CD: t, PAN_ST_DT: ymd8(todayKst(-90)), PAN_ED_DT: ymd8(todayKst()) }),
  '유형·날짜만 없음': () => ({ ...base, CNP_CD: '11' }),
};
for (const [name, mk] of Object.entries(V)) for (const t of name === '유형·날짜만 없음' ? ['-'] : ['06', '13', '39']) {
  try {
    const data = await getJson('LH', URL_, mk(t)), arr = Array.isArray(data) ? data : [data];
    const list = arr.find(p => Array.isArray(p?.dsList))?.dsList ?? [], sch = arr.find(p => p?.dsSch)?.dsSch?.[0], head = arr.find(p => p?.resHeader)?.resHeader?.[0];
    console.log(`[${name}] 유형 ${t}: ${list.length}건 (ALL_CNT ${list[0]?.ALL_CNT ?? '-'}) · 응답 ${JSON.stringify(head ?? {})} · 서버가 읽은 조건 ${JSON.stringify(sch ?? {})}`);
    for (const r of list.slice(0, 3)) console.log(`   - ${r.PAN_NM} | ${r.CNP_CD_NM} | ${r.AIS_TP_CD_NM} | ${r.PAN_SS} | 게시 ${r.PAN_NT_ST_DT} | 마감 ${r.CLSG_DT}`);
  } catch (e) { console.log(`[${name}] 유형 ${t}: 실패 ${scrub(e.message)}`); }
}
