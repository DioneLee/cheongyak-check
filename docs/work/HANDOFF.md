# 인수인계 — 청약 체크 (2026-11-06)

## 지금 상태

- 배포됨: https://dionelee.github.io/cheongyak-check/ (저장소 DioneLee/cheongyak-check, Pages = main / root) · 2026-11-06
- 검사: `python scripts/verify/check.py` 70/70 OK (서울 한정 2건 포함 · SUITABLE HOME 과 판정 동등성 16건 포함) · `node scripts/verify/feed_check.mjs` 10/10
- 화면 사진: `screenshots/{first,result}_{pc1280,mobile390}.png`
- SUITABLE HOME(../sjcu) 쪽: 청약 탭 맨 위 안내 한 줄 (커밋 e0e8447, 백업 `index_v27_backup.html`) · v10 73/73 · v8 55/55

## 다음

- [ ] 사용자: Secrets `DATA_GO_KR_KEY` 넣기 → Actions "공고 피드" 수동 실행 (키 넣기 전에는 예약 실행이 실패로 표시됨)
- [ ] 안티그래비티: 디자인 폴리싱 · PWA 아이콘(`icons/` 임시본 교체 → sw.js VERSION 올리기)
- [ ] 첫 Actions 실행에서 공공데이터 API 가 해외(GitHub) 서버에서 되는지 확인
- [ ] 2027-01-20 이후: SUITABLE HOME 청약 탭을 링크로 바꿀지 결정
