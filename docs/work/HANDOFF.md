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
- [x] 피드백 반영(2026-11-06, sw 06d): 첫 화면 = 공고 바로가기, 진단은 둘째(제목 밑에 바로 PDF 올리기 + 질문) · 설명·3단계 카드·PC 왼쪽 칸 뺌 → `docs/design/분리설계.md` 화면
- `check.py` 는 Mac 에서도 돈다 (Chrome 경로 자동 · 포트가 겹치면 `CHECK_PORT=8792 python3 scripts/verify/check.py`)
- [ ] 피드백 남은 질문: 한부모·세대 분리(부모 밑 등재)·부모님 재정에 따른 공고별 특이사항은 판정에 없음 → 판정 규칙을 넓힐지 결정 (SUITABLE HOME 과 동등성 유지 필요)
- [ ] 화면 사진 `screenshots/` 는 예전 구성 그대로 (새로 찍기)
- [x] SH 공고 게시판을 피드에 추가(2026-11-06, sw 06e): 주택임대·주택분양 목록 4쪽씩 POST · 제목에 '모집'이 있고 당첨·발표·채용·안내 등이 없는 글만 · 마감일은 안 읽음(게시 21일까지, 화면에 "게시 날짜 · 마감일은 공고문에서") · SH 목록 모양이 바뀌면 SH 만 실패하고 LH·마이홈은 그대로
- [x] 서울 청년안심주택 모집공고도 피드에 추가(2026-11-06, sw 06f): soco.seoul.go.kr 목록 JSON(`bbsListJson.json`, bbsId BMSR00015) 3쪽 · 청약신청일(optn4)을 마감일로 → D-day 표시·지난 공고 자동 제외
- 왜 LH·행복주택이 적은가: 2026-11-06 확인 시 LH 청약플러스 진행 중 52건 중 서울 0건, 마이홈 서울 모집중은 캠코 1건뿐 (데이터 문제 아님)
- [ ] 2027-01-20 이후: SUITABLE HOME 청약 탭을 링크로 바꿀지 결정
