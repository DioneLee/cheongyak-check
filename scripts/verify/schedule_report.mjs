// 정기 실행 간격 표: node scripts/verify/schedule_report.mjs [시작 UTC, 기본 = 1시간 정기 실행을 올린 2026-11-07T11:05 (fbfd455)]
// 예정 = 매시 :17 (UTC, GitHub) · :47 (Cloudflare Worker, from_cron). 정기 실행(schedule)마다 예정 시각 대비 지연, '최근 100분 안에 성공 → 건너뜀' 여부, 건너뛴 예정 회차를 보여 준다
import { execFileSync } from 'node:child_process';
const sinceArg = process.argv[2] || '2026-11-07T11:05', since = new Date(/Z|[+-]\d\d:?\d\d$/.test(sinceArg) ? sinceArg : sinceArg + 'Z').toISOString(), gh = a => JSON.parse(execFileSync('gh', a, { encoding: 'utf8' }));
const runs = gh(['run', 'list', '--workflow', 'feed.yml', '--limit', '200', '--json', 'databaseId,createdAt,event,conclusion']).filter(r => Date.parse(r.createdAt) >= Date.parse(since)).reverse();
const kst = t => new Date(Date.parse(t) + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
const slotOf = t => { const d = new Date(t); d.setUTCMinutes(17, 0, 0); if (Date.parse(t) < d) d.setUTCHours(d.getUTCHours() - 1); return d.toISOString(); };
const rows = [], used = new Set();
for (const r of runs) {
  const steps = gh(['run', 'view', String(r.databaseId), '--json', 'jobs']).jobs.flatMap(j => j.steps);
  const ran = steps.find(s => s.name === '공고 받기')?.conclusion === 'success', guard = steps.find(s => s.name === '정기 실행이 겹치면 건너뜀')?.conclusion === 'success', probe = steps.some(s => /진단/.test(s.name) && s.conclusion === 'success');
  if (r.event === 'schedule') { const s = slotOf(r.createdAt); used.add(s); rows.push({ slot: s, at: r.createdAt, ev: '정기', delay: Math.round((Date.parse(r.createdAt) - Date.parse(s)) / 6e4), ran, guard }); }
  else rows.push({ slot: '', at: r.createdAt, ev: guard ? 'Cloudflare(:47)' : '손으로', delay: guard ? Math.round((Date.parse(r.createdAt) - Date.parse(slotOf(r.createdAt)) - 30 * 6e4) / 6e4) : null, ran, guard, probe });   // from_cron 실행은 guard 단계가 돈다
}
const now = Date.now(); for (let t = Date.parse(slotOf(new Date(Date.parse(since)).toISOString())) + 36e5 * (Date.parse(since) > Date.parse(slotOf(since)) ? 1 : 0); t < now - 60 * 6e4; t += 36e5) {
  const s = new Date(t).toISOString(); if (!used.has(s)) rows.push({ slot: s, at: '', ev: '정기', delay: null, ran: null, miss: true }); }
rows.sort((a, b) => (a.slot || a.at).localeCompare(b.slot || b.at));
console.log('| 예정 (KST) | 실제 시작 (KST) | 종류 | 지연 | 결과 |\n|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.slot ? kst(r.slot) : '-'} | ${r.at ? kst(r.at) : '-'} | ${r.ev} | ${r.delay == null ? '-' : r.delay + '분'} | ${r.miss ? '**안 돎**' : r.ran ? '갱신함' : r.probe ? '진단만' : r.guard ? '건너뜀(100분 안에 성공)' : '실패'} |`);
const sch = rows.filter(r => r.ev === '정기');
console.log(`\n정기 예정 ${sch.length}회 · 돎 ${sch.filter(r => !r.miss).length} · 안 돎 ${sch.filter(r => r.miss).length} · 실제 갱신 ${rows.filter(r => r.ran).length}회`);
