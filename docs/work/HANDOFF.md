# 인수인계 — 청약 체크 (2026-11-06)

## 지금 상태

- 배포됨: https://dionelee.github.io/cheongyak-check/ (저장소 DioneLee/cheongyak-check, Pages = main / root) · 2026-11-06
- 검사: `python scripts/verify/check.py` 70/70 OK (서울 한정 2건 포함 · SUITABLE HOME 과 판정 동등성 16건 포함) · `node scripts/verify/feed_check.mjs` 10/10
- 화면 사진: `screenshots/{first,result}_{pc1280,mobile390}.png`
- SUITABLE HOME(../sjcu) 쪽: 청약 탭 맨 위 안내 한 줄 (커밋 e0e8447, 백업 `index_v27_backup.html`) · v10 73/73 · v8 55/55

## 다음

- [x] Secrets `DATA_GO_KR_KEY` · Actions 첫 실행 성공 (해외 서버에서도 API 응답)
- [x] 안티그래비티 아이콘 적용 (sw VERSION 06b) · AI 붐빔 2초 재시도 · 첫 방문 3단계 안내 · 1단계 카드 누르면 바로 다음
- LH 0건 원인(2026-11-06 진단 `lh_probe.mjs`): 필터·필드 이름은 정상. 최근 90일 서울 LH 공고 8건이 모두 접수 마감이라 빠짐. 진단은 Actions → 공고 피드 → Run workflow → probe 체크
- [ ] 2027-01-20 이후: SUITABLE HOME 청약 탭을 링크로 바꿀지 결정
