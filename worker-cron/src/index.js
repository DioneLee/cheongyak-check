// Cron 이 부르면 GitHub Actions '공고 피드' workflow_dispatch(from_cron=true) 를 한 번 부른다. 토큰은 env.GH_TOKEN (wrangler secret) — 로그에 찍지 않는다.
export const why = s => s === 401 || s === 403 ? '토큰 만료/권한 오류 (GH_TOKEN 을 새로 만들어 넣기 · Actions: Read and write)' : s === 404 ? '저장소·workflow 이름 확인' : s === 422 ? 'ref·inputs 확인 (workflow 에 from_cron 입력이 있는지)' : s === 0 ? 'GH_TOKEN 없음 (npx wrangler secret put GH_TOKEN)' : 'GitHub 응답 오류';
export async function dispatch(env, fetchFn = fetch) {
  if (!env.GH_TOKEN) return { ok: false, status: 0, why: why(0) };
  const r = await fetchFn(`https://api.github.com/repos/${env.REPO}/actions/workflows/${env.WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'cheongyak-feed-cron', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: env.REF || 'main', inputs: { from_cron: 'true' } }),
  });
  if (r.status === 204) return { ok: true, status: 204 };
  const detail = (await r.text()).slice(0, 200).split(env.GH_TOKEN).join('***');
  return { ok: false, status: r.status, why: why(r.status), detail };
}
export default {
  async scheduled(event, env) {
    const res = await dispatch(env);
    if (res.ok) { console.log(`공고 피드 실행 요청함 (${event.cron})`); return; }
    console.error(`공고 피드 실행 요청 실패: ${res.status} ${res.why}${res.detail ? ` · ${res.detail}` : ''}`);
    throw new Error(`dispatch ${res.status}: ${res.why}`);   // Cloudflare 대시보드에 실패로 보이게
  },
};
