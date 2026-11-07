// 마이홈포털 API 진단: 서울 모집공고 응답에 어떤 칸(필드)이 있는지 · 상세/첨부 주소가 있는지 본다 (키는 찍지 않음)
// Actions → 공고 피드 → Run workflow → probe_myhome 체크
import { getJson, scrub } from '../feed.mjs';
const BASE = 'https://apis.data.go.kr/1613000/HWSPR02';
const ym = off => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7).replace('-', ''); };
for (const op of ['rsdtRcritNtcList', 'ltRsdtRcritNtcList', 'rsdtRcritNtcDetail', 'rsdtRcritNtcInfo', 'rsdtRcritNtcDtl']) {
  try {
    const data = await getJson('마이홈 ' + op, `${BASE}/${op}`, { brtcCode: '11', numOfRows: '20', pageNo: '1', yearMtBegin: ym(-2), yearMtEnd: ym(0), pblancId: '21471' });
    const body = data?.response?.body ?? data?.body ?? {}, raw = body.item ?? body.items?.item ?? body.items ?? [], list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    console.log(`[${op}] ${list.length}건 · header ${JSON.stringify(data?.header ?? data?.response?.header)}`);
    const keys = [...new Set(list.flatMap(r => Object.keys(r)))]; console.log(`  필드: ${keys.join(', ')}`);
    const it = list.find(r => String(r.pblancId) === '21471') || list[0];
    if (it) for (const [k, v] of Object.entries(it)) console.log(`  ${k} = ${String(v).slice(0, 160)}`);
  } catch (e) { console.log(`[${op}] 실패: ${scrub(e.message)}`); }
}
