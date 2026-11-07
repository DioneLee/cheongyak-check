// 상세 복구 (AI 안 씀): feed/detail/*.json 마다 git 기록에 남은 예전 버전들을 칸별 합치기(mergeDetail)로 지금 버전에 합친다
// 목록 칸(자격·특이사항·주택형·일정·비용)은 항목이 더 많은 쪽, 한 줄 칸은 지금 값이 비었으면 예전 값. 읽은 모델·시각·버전(v)은 지금 것 그대로
// 사용: node scripts/restore_details.mjs [--dry]   → 바뀐 파일과 notices.json 의 dv 를 고친다 (커밋은 직접)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { DETAIL_DIR, mergeDetail, LIST_KEYS, LINE_KEYS, detailStamp } from './detail.mjs';
const dry = process.argv.includes('--dry'), git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 24 });
const body = o => ({ ...Object.fromEntries(LINE_KEYS.map(k => [k, o?.[k] || null])), ...Object.fromEntries(LIST_KEYS.map(k => [k, Array.isArray(o?.[k]) ? o[k] : []])) });
const count = o => LIST_KEYS.map(k => `${k} ${o[k]?.length || 0}`).join(' · ');
const changed = [];
for (const f of (await readdir(DETAIL_DIR)).filter(f => /\.json$/.test(f) && !f.startsWith('_'))) {
  const path = `feed/detail/${f}`, cur = JSON.parse(await readFile(DETAIL_DIR + f, 'utf8')); if (cur.source === 'api') continue;
  let acc = body(cur); const kept = new Set();
  for (const h of git('log', '--format=%H', '--', path).split('\n').filter(Boolean)) {
    let old; try { old = JSON.parse(git('show', `${h}:${path}`)); } catch { continue; }
    if (old.source === 'api') continue;
    const m = mergeDetail(body(old), acc); acc = m.d; m.kept.forEach(k => kept.add(`${k}←${h.slice(0, 7)}`));
  }
  if (JSON.stringify(acc) === JSON.stringify(body(cur))) continue;
  console.log(`${f}: ${count(body(cur))}  →  ${count(acc)}  (${[...kept].join(', ')})`);
  if (!dry) await writeFile(DETAIL_DIR + f, JSON.stringify({ ...cur, ...acc }, null, 1) + '\n', 'utf8');
  changed.push(f.slice(0, -5));
}
if (!dry && changed.length) {   // 사이트가 새 상세를 받도록 notices.json 의 dv(상세 내용 해시)도 고친다
  const nf = new URL('../feed/notices.json', import.meta.url), feed = JSON.parse(await readFile(nf, 'utf8'));
  for (const it of feed.items) if (changed.includes(it.id)) it.dv = await detailStamp(`${DETAIL_DIR}${it.id}.json`);
  await writeFile(nf, JSON.stringify(feed, null, 1) + '\n', 'utf8');
}
console.log(`복구 ${changed.length}건${dry ? ' (--dry: 쓰지 않음)' : ''}`);
