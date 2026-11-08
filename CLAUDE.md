# 청약 체크 — 프로젝트 규칙

- 새 세션은 `docs/work/HANDOFF.md` 부터 읽는다. 왜 이렇게 됐는지는 `docs/work/변경기록.md`, 설계는 `docs/design/분리설계.md`
- 작업이 끝나면 `변경기록.md` 에 요청 → 한 일 → 확인 결과를, `HANDOFF.md` 의 지금 상태·남은 일을 고친다 (대화에만 있는 결정·확인 결과를 남기기)
- 역할: 코딩·판정 무결성·PWA·자동 검사 = Claude Code / UI·디자인 토큰·아이콘 = 안티그래비티
- 판정·계산 코드는 SUITABLE HOME(../sjcu)과 같아야 한다 → 고치면 `python scripts/verify/check.py` 의 판정 동등성까지 통과
- SUITABLE HOME 저장 키 `newlywed-home-v1` 은 읽기만 (check.py 정적 검사가 막음). 테스트는 임시 Chrome 프로필 + localhost 에서만
- API 키를 코드·로그에 넣지 않는다 (공공데이터 키는 GitHub Secrets `DATA_GO_KR_KEY`). 회원가입·서버 저장·방문자 분석 도구 넣지 않기
- index.html·아이콘·예시를 바꾸면 `sw.js` 의 VERSION 도 바꾼다 (check.py 가 알려 줌)
- `lib/` 를 바꾸면 VERSION 과 index.html 의 `lib/feed-tools.js?v=` 를 같은 값으로 (check.py 가 확인)
- 로컬에서는 실제 Gemini 를 부르지 않는다 (`scripts/detail.mjs` 가 막음 · 검사는 가짜 응답). 꼭 부르면 `DETAIL_ALLOW_REAL=1` + `_quota.json` 커밋
- 사용자 입력(생년월일·소득·자산·관심 공고·필터)은 브라우저에만. Actions 는 공고 공개 정보만 계산
- 검사: `CHECK_PORT=8792 python3 scripts/verify/check.py` · `node scripts/verify/{tools,detail,feed,cron}_check.mjs` — 검사는 저장소 파일에 쓰지 않게 (임시 폴더)
- `git add -A` 전에 `git status -s` 확인 (`.playwright-mcp/` 같은 임시 파일)
- **push 전에 항상 `git pull --rebase origin main`** (Actions 가 공고 피드 커밋을 올림)
- 커밋에 Claude 서명 줄 없음 · 커밋/push 는 확인받고
