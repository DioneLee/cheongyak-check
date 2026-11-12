// 바깥 사이트에서 받은 주소는 http(s) 만 저장한다 (javascript: · data: 등은 빈 글자) — 화면도 safeUrl 로 한 번 더 거른다
export const httpUrl = u => { try { const x = new URL(String(u ?? '').trim()); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
