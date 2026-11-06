# 청약 체크 — 프로젝트 규칙

- 새 세션은 `docs/work/HANDOFF.md` 부터 읽는다. 설계는 `docs/design/분리설계.md`
- 역할: 코딩·판정 무결성·PWA·자동 검사 = Claude Code / UI·디자인 토큰·아이콘 = 안티그래비티
- 판정·계산 코드는 SUITABLE HOME(../sjcu)과 같아야 한다 → 고치면 `python scripts/verify/check.py` 의 판정 동등성까지 통과
- SUITABLE HOME 저장 키 `newlywed-home-v1` 은 읽기만 (check.py 정적 검사가 막음). 테스트는 임시 Chrome 프로필 + localhost 에서만
- API 키를 코드·로그에 넣지 않는다 (공공데이터 키는 GitHub Secrets `DATA_GO_KR_KEY`). 회원가입·서버 저장·방문자 분석 도구 넣지 않기
- index.html·아이콘·예시를 바꾸면 `sw.js` 의 VERSION 도 바꾼다 (check.py 가 알려 줌)
- 커밋에 Claude 서명 줄 없음 · 커밋/push 는 확인받고
