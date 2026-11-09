# 인수인계 — 청약 체크 (마지막 정리 2026-11-09)

새 세션은 이 파일 → [변경기록.md](변경기록.md)(왜 이렇게 됐는지) → `docs/design/분리설계.md`(설계) 순서로 읽는다.

## 지금 상태

- **앱(Android·iOS)은 [HANDOFF_app.md](HANDOFF_app.md)** — Capacitor 8 · 테스트 앱 ID · iOS 는 집 Mac 에서

- 배포: https://dionelee.github.io/cheongyak-check/ (저장소 DioneLee/cheongyak-check · Pages = main / root · 서비스 워커 `cheongyak-check-2026-11-09f`)
- 단지 탭 `#danji` + 단지 직접 공고(엘리스) (2026-11-09, `docs/design/단지.md`): 메뉴 "공고/단지/진단/설정" · 서울 청년안심주택 100곳 + 그 밖의 서울 민간임대 6곳 · 관심 단지 ★ → 새 공고 띠(앱은 알림)
- 탭 (2026-11-09, `docs/design/탭과문구.md`): 공고 `#notices`(원문 사이트 4곳 · 공고 목록 · 필터 · 관심 공고 · 캘린더 · 줄마다 '진단 →') · 진단 `#diag`(PDF 올리기 + 질문 + 결과) · 설정 `#settings`(AI 설정 · 데이터 옮기기 · 고급)
- 캘린더 (2026-11-09 sw 09f): 시작·마감을 아는 공고는 '청약 기간' 한 일정(하루 종일 · 마감 시각은 제목 · 알림 2개) · 발표일은 청년안심(본문 발표 줄)·마이홈(API)만 · 구독 캘린더 = 청약 기간 + 발표
- 판정 문구는 "입력한 조건으로는 … 보여요" + 예비 판정 줄 · 처음 결과 볼 때 이용약관(`terms.html`) 확인 한 번 (키 `cheongyak-check-terms`)
- 공고 출처: LH·마이홈포털 공공데이터 API + SH 공고 게시판 + 서울 청년안심주택 모집공고 목록 + 단지 직접(엘리스, `scripts/sources/`) (서울만)
  - 게시판(SH·청년안심)은 2026-11-09 부터 제목·기관·날짜·원문 링크만 (본문·공고문은 저장·AI 읽기 안 함) · 같은 사이트 요청 3초 간격 · 실행마다 robots.txt 확인 · 실제 실행 하루 약 4번
- 공고 상세(신청 조건 요약): 2026-11-09 부터 마이홈 API 기본 정보만 (게시판 공고는 상세 없음 → '공고 원문 보기'). Gemini 자동 읽기 코드(detail.mjs)는 남아 있지만 지금 부르는 출처 없음
- 검사 (2026-11-09 마지막): `python scripts/verify/check.py` 153/153 (판정 동등성 포함) · `node scripts/verify/tools_check.mjs` 34 · `detail_check.mjs` 57 · `feed_check.mjs` 24 · `danji_check.mjs` 28 · `app_bridge_check.mjs` 32 · `cron_check.mjs` 5
  - 판정 동등성 검사는 `../sjcu/index_v28_backup.html`(SUITABLE HOME 마지막 청약 버전)이 있는 PC 에서만 돈다
  - check.py 의 파일 불러오기·PDF 항목이 가끔 타이밍으로 NG → 다시 돌리면 OK

## 구조 (데이터 흐름)

```
GitHub Actions '공고 피드' (매시 :17 schedule + Cloudflare Worker 매시 :47 · 최근 5시간 50분 안에 실제 갱신했으면 건너뜀 = 하루 약 4번)
  scripts/feed.mjs     공고 목록 (LH·마이홈 API, SH 게시판, 청년안심주택 JSON + 본문의 청약신청·발표 줄) → 서울만 · 마감 지난 것 빼기 · 정정공고면 예전 것 숨김
  scripts/detail.mjs   공고 상세: PDF + 게시판 본문 → Gemini(첫 모델 하루 18번 · 새 공고는 lite) → feed/detail/{id}.json
  scripts/sources/elyes.mjs  단지 직접 공고 (엘리스 · 제목·날짜·링크만 · 별칭 표로 서울 단지만)
  scripts/danji.mjs    단지 정보 하루 1번: 서울시 목록 · view.do(새 단지 매일·전체 7일) · 게시판 이력 → feed/danji.json · danji_bbs.json
  scripts/enrich.mjs   공개 정보 구조화: 일정(ev) · 자격 기준(cr) · 주택형(ty) · 역(st) → notices.json · 구독 캘린더 feed/calendar.ics
사이트 index.html + lib/feed-tools.js (브라우저에서만): 신청 가능 배지 · 필터 · .ics 만들기 · 관심 공고(★) · 진단
```

- 내 입력(생년월일·소득·자산·관심 공고·필터)은 브라우저 localStorage 에만. 서버로 보내지 않음
- 상세 파일 주요 칸: `model`·`readAt`(누가 언제 읽었나) · `src`(원문 해시) · `att`(첨부 식별자) · `seq`(.ics SEQUENCE) · `near`(본문의 역·출구) · `addr` · `defer`(미룸 횟수)
- 상태 파일(feed/detail/): `_quota.json`(첫 모델 오늘 사용 수) · `_fail.json`(실패·미룸) · `_compare.jsonl`(lite↔첫 모델 비교) · `_seq.json` / feed/: `geo.json`(좌표) · `stations.json`(OSM 서울 지하철역)

## 운영 방법

- 손으로 갱신: `gh workflow run feed.yml` (손으로 돌리면 건너뛰기 없이 항상 돈다) · 결과 `gh run view <id> --log`
- 로그에서 볼 줄: `상세 · 첫 모델 오늘 사용 N/18` · `Gemini 호출 · …` · `꾸미기 · 일정 … 역 …` · `상세 · …: lite↔첫 모델 비교 …`
- 정기 실행 간격 표: `node scripts/verify/schedule_report.mjs` (예정 대비 지연 · 건너뜀 · 안 돈 회차, :17 GitHub / :47 Cloudflare)
- 진단 실행: Actions → 공고 피드 → Run workflow → `probe`(LH API) · `probe_myhome`(마이홈 API 응답 칸)
- 상세가 줄어들었을 때 복구: `node scripts/restore_details.mjs --dry` → 확인 후 `--dry` 없이 (원문 해시가 같은 버전끼리만 · AI 안 씀)
- **로컬에서는 실제 Gemini 를 부르지 않는다**: detail.mjs 는 Actions·검사(`DETAIL_TEST=1`)에서만 부름. 꼭 필요하면 `DETAIL_ALLOW_REAL=1` → 그 호출도 `_quota.json` 에 더해지니 끝나면 `_quota.json` 커밋·push
- `lib/` 를 바꾸면 sw.js VERSION 을 올리고 index.html 의 `lib/feed-tools.js?v=` 도 같은 값으로 (check.py 가 확인)
- push 전에 항상 `git pull --rebase origin main` (Actions 가 피드 커밋을 자주 올림)

## 저장소 밖에 있는 설정

| 어디 | 무엇 | 메모 |
|---|---|---|
| GitHub Secrets | `DATA_GO_KR_KEY` (공공데이터) · `GEMINI_API_KEY` (상세 읽기 전용, Google Cloud 프로젝트 cheongyak-check) | 값은 저장소·로그에 남기지 않음 |
| AI Studio 한도 (cheongyak-check) | gemini-3.6-flash RPM 5·RPD 20 · gemini-3.5-flash-lite RPM 15·RPD 500 · TPM 250K | 태평양 자정(한국 17:00) 초기화 · 429 시도도 사용량에 셈 |
| Cloudflare Worker `cheongyak-feed-cron` | 코드 `worker-cron/` · Cron `47 * * * *` · 비밀값 `GH_TOKEN` · Observability 로그 켬 | 배포 `cd worker-cron && npx wrangler deploy` |
| GH_TOKEN | fine-grained · 저장소 DioneLee/cheongyak-check · Actions: Read and write 만 | **만료 2027-11-06 (넣은 날 2026-11-07)** · 만료 전에 새로 만들어 `npx wrangler secret put GH_TOKEN` · 만료되면 Worker 로그에 "토큰 만료/권한 오류" |
| Cloudflare Cron 칸 (무료 5개) | 지금: som · demo-shop · cheongyak-feed-cron | som 저장소의 demo-lookbook·estate·brand 크론을 껐음 (master `0466719` · rack-renewal `fe20674`). **som 의 rack-renewal 을 배포하기 전에 `git pull`** (안 하면 크론이 다시 생겨 6개 → 배포 실패) |
| GitHub CLI(gh) | `workflow` 권한 추가함 (workflow 파일 push 에 필요) | 다른 PC 는 `gh auth refresh -h github.com -s workflow` |

## 남은 일

- [ ] lite↔첫 모델 비교 며칠 모은 뒤 칸별 판단 (`feed/detail/_compare.jsonl`). 첫 4건(SH)은 첫 모델이 일정·비용을 더 적게 채움
- [ ] 정기 실행 표 다시 보기 (21시간 멈춤 버그를 2026-11-08 19시쯤 고친 뒤 :17·:47 이 제대로 번갈아 도는지)
- [ ] 역 거리 정확도: 국내 지오코더(브이월드·카카오) 키가 있으면 바꾸기 · 역 좌표를 서울시 공공데이터로 바꾸려면 인증키 필요 (지금은 OSM)
- [ ] 특이사항 점수: 한부모·부모 밑 세대·부모님 재정 등 공고별 가점을 판정에 넣을지 (실사용자 질문, 2026-11-06)
- [ ] 상세 다음 단계: '이 공고로 내 조건 진단' 버튼(판정용 공고 JSON 도 읽기) · LH 공고문 PDF 찾기
- [ ] 신청 가능 배지: '기타 조건'(청약자=계약자 동일인 등)은 판정하지 않음 → 이대로 둘지
- [ ] 정정공고 표시는 이름이 겹칠 때만 잡힘 (피드 제목과 공고 이름이 많이 다르면 놓침)
- [x] SUITABLE HOME 에서 청약 화면을 뺌 (2026-11-09, SUITABLE HOME v28) · 메뉴 링크 '청약 체크 ↗' 는 2027-01-20 까지 유지
- [ ] lite↔첫 모델 비교 · 상세 다음 단계는 게시판 상세를 안 만들면서 대상이 거의 없어짐 → 계속할지 결정
- [ ] GH_TOKEN 만료(2027-11-06) 전에 새 토큰

## 사고와 교훈 (다시 안 겪게)

- 정기 실행 21시간 멈춤 (2026-11-07~08): 건너뛴 실행도 결과가 success → '최근 성공' 판단에 쓰면 안 됨. 배포 뒤 몇 시간 안에 `schedule_report.mjs` 로 확인할 것
- 배포 직후 옛 lib 가 섞임: 서비스 워커가 저장본 먼저로 주던 파일은 index.html 과 버전이 엇갈릴 수 있음 → `?v=버전` + 인터넷 먼저
- 예전 브라우저가 옛 상세를 보여 줌: 상세 주소에 내용 해시(dv)를 붙임
- lite 가 다시 읽으며 상세가 줄어듦: 다시 읽기는 첫 모델로만 · 칸별 합치기 · 원문 해시가 다르면 교체
- 검사가 저장소 파일(`docs/work/미룸.md`)에 가짜 기록을 씀: 검사는 임시 폴더만 쓰게(`DETAIL_DEFER_LOG`)
- Playwright 임시 파일이 커밋에 섞임: `.playwright-mcp/` 는 .gitignore 에 (2026-11-08 한 번 커밋됐다가 지움, 기록에는 남음)
- `git add -A` 전에 `git status -s` 로 무엇이 들어가는지 볼 것

## 참고

- LH·행복주택이 적은 이유: 2026-11-06 확인 시 LH 진행 중 52건 중 서울 0건 (데이터 문제 아님) · LH 진단은 `probe`
- [미룸.md](미룸.md): 상세를 못 읽은 채 마감된 공고가 자동으로 적힘
- SUITABLE HOME(../sjcu) 쪽: 청약 탭 맨 위 안내 한 줄 (커밋 e0e8447, 백업 `index_v27_backup.html`)
