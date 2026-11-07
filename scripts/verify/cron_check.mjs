// Cloudflare Worker(정기 호출 worker-cron) 검사: node scripts/verify/cron_check.mjs
import assert from 'node:assert/strict';
const W = await import('../../worker-cron/src/index.js'), { dispatch } = W;
let ok = 0; const t = async (n, f) => { await f(); ok++; console.log('OK', n); };
const env = { GH_TOKEN: 'github_pat_TESTONLY', REPO: 'DioneLee/cheongyak-check', WORKFLOW: 'feed.yml', REF: 'main' }, seen = [];
await t('workflow_dispatch(from_cron=true) 를 POST · 토큰은 Authorization 헤더로만', async () => {
  const r = await dispatch(env, async (u, o) => { seen.push([u, o]); return new Response(null, { status: 204 }); }); assert.equal(r.ok, true); const [u, o] = seen[0];
  assert.equal(u, 'https://api.github.com/repos/DioneLee/cheongyak-check/actions/workflows/feed.yml/dispatches'); assert.equal(o.method, 'POST');
  assert.equal(o.headers.Authorization, 'Bearer github_pat_TESTONLY'); assert.deepEqual(JSON.parse(o.body), { ref: 'main', inputs: { from_cron: 'true' } }); });
for (const s of [401, 403]) await t(`${s} → '토큰 만료/권한 오류' · 응답에서 토큰 지움`, async () => {
  const r = await dispatch(env, async () => new Response('Bad credentials github_pat_TESTONLY', { status: s })); assert.equal(r.ok, false); assert.match(r.why, /^토큰 만료\/권한 오류/); assert.ok(!r.detail.includes('TESTONLY')); });
await t('scheduled 가 401 이면 console.error 에 토큰 만료/권한 오류 · 실패로 끝남', async () => {
  const errs = [], ce = console.error, f0 = globalThis.fetch; console.error = m => errs.push(m); globalThis.fetch = async () => new Response('Bad credentials', { status: 401 });
  await assert.rejects(W.default.scheduled({ cron: '47 * * * *' }, env)); console.error = ce; globalThis.fetch = f0; assert.match(errs[0], /401 토큰 만료\/권한 오류/); });
await t('토큰이 없으면 부르지 않음', async () => { const r = await dispatch({ ...env, GH_TOKEN: '' }, async () => { throw new Error('부르면 안 됨'); }); assert.equal(r.ok, false); assert.match(r.why, /GH_TOKEN 없음/); });
console.log(`${ok}개 모두 OK`);
