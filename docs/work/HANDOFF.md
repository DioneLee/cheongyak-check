# 인수인계 — 청약 체크 (마지막 정리 2026-11-15)

새 세션은 이 파일 → [변경기록.md](변경기록.md)(왜 이렇게 됐는지) → `docs/design/분리설계.md`(설계) 순서로 읽는다.

## 지금 상태

- 화면 디자인 (2026-11-24): '안내서' 테마(숲녹색 · 제목 Noto Serif KR) = index.html `</style>` 바로 앞 CSS 묶음 · 비교했던 다른 버전과 만든 도구는 이 저장소 밖 `orca/projects/cheongyak-variants` ([변경기록.md](변경기록.md) 2026-11-24)
- **앱(Android·iOS)은 [HANDOFF_app.md](HANDOFF_app.md)** — Capacitor 8 · 테스트 앱 ID · iOS 는 집 Mac 에서

- 배포: **https://seoul-cheongyak-check.pages.dev/** (Cloudflare Pages · Git 연결 main · 빌드 없음 · 출력 `/` · `_headers` 로 피드 no-cache·CORS) · 예전 https://dionelee.github.io/cheongyak-check/ (GitHub Pages = main / root · 끄지 말 것: 구독 캘린더가 여기서 계속 갱신 · '주소가 바뀌었어요' 띠) · 서비스 워커 `cheongyak-check-2026-11-25b`)
- Android 테스트 설치 (2026-11-16): 사이트 맨 아래 'Android 앱 테스트 설치(apk)' → `https://github.com/DioneLee/cheongyak-check/releases/latest/download/cheongyak-check.apk` (앱 안에서는 숨김) · 지금 최신 **v1.3-test** (versionCode 4 · 2026-11-25 안내서 디자인) · 새 판은 `assembleRelease` → 사용자가 apksigner 로 서명(업로드 키, 비밀번호는 사용자만) → `gh release create vX-test --latest` → 받은 파일 해시 확인 · Play 로 넘어갈 때는 지우고 다시 설치(Play 앱 서명)
- 의견 보내기 (2026-11-16): 맨 아래 '의견 보내기 ↗' = Google 설문지 '청약 체크 의견 보내기'(질문 4개 · 이메일 수집 안 함 · 편집 docs.google.com/forms/d/1Rs6vrFEVn95s89XMGOBLqPD8J2a1u5AV8LswEMGdKyM/edit) · 커뮤니티 게시판(간편 로그인)은 의견이 모인 뒤 다시 논의
- 민간 임대 단지 카드 '공고 보기 ↗' = 그 단지의 접수 중 공고 원문(새 창) · 관심 공고 캘린더 버튼은 목록/지도 줄 오른쪽 (2026-11-16)
- 단지 탭 `#danji` + 단지 직접 공고(엘리스) (2026-11-09, `docs/design/단지.md`): 메뉴 "공고/단지/진단/설정" · 서울 청년안심주택 100곳 + 그 밖의 서울 민간임대 6곳 · 관심 단지 ★ → 새 공고 띠(앱은 알림)
- 지도로 보기 (2026-11-13 · 건물 점 2026-11-14, `docs/design/지도로_보기.md`): 공고·단지 탭 '목록 / 지도' · 멀리 = 구별 동그라미(겹치지 않게 밀어 놓음) · 가까이 = 건물 점(단지 좌표 `danji.json` ll — 서울시·엘리스 단지 화면 지도 값) · 단지와 연결 안 된 공고(SH·LH)는 가까운 역 핀
  - 지도 엔진 (2026-11-15): 웹은 **네이버 지도**(Client ID `NAVER_ID` 공개 값 · 네이버 클라우드 콘솔 앱 'cheongyak-check' · 등록 주소 pages.dev·github.io·localhost · 월 600만·하루 20만 한도) · Android 앱도 네이버 · iOS 앱(bridge.js 가 CC_MAP_ENGINE='leaflet')과 네이버 안 될 때(스크립트 막힘·인증 실패)는 Leaflet+OSM · CSP script-src 에 nrbe.pstatic.net(https 지도 모양)도 필요 · 네이버 사용 기록(nelo)은 CSP 로 막음 · 새 주소에서 쓰려면 네이버 콘솔에 주소 추가
- 메뉴는 '청약 공고 / 내 점수계산' 2칸 · 청약 공고 안쪽 탭 '공고(#notices) / 민간 임대(#danji)' (2026-11-15) · 단지 칸 제목 '서울 민간 임대 단지'
- 진단 탭 이름은 화면에서 '내 점수계산' (2026-11-15 · 주소는 그대로 `#diag`) · 스토어 문구(`docs/store/스토어.md`)는 아직 '예비 진단'
- 메뉴는 "공고/단지/진단" 3개 (2026-11-12) · 설정 `#settings` 는 맨 아래 '데이터 백업·옮기기' 링크로만 (백업·옮기기 + 접힌 고급)
- 탭 (2026-11-09, `docs/design/탭과문구.md`): 공고 `#notices`(원문 사이트 4곳 · 공고 목록 세부 탭 진행 중/예정/완료 · 검색(이름·역·구 + 구 선택) · 관심 공고 · 캘린더 · 줄마다 '진단 →') · 진단 `#diag`(PDF 올리기 + 질문 + 결과) · 설정 `#settings`(AI 설정 · 데이터 옮기기 · 고급)
- 캘린더 (2026-11-09 sw 09f): 시작·마감을 아는 공고는 '청약 기간' 한 일정(하루 종일 · 마감 시각은 제목 · 알림 2개) · 발표일은 청년안심(본문 발표 줄)·마이홈(API)만 · 구독 캘린더 = 청약 기간 + 발표 (마감됨 공고 빼고 · 단지 직접 공고는 제목에 단지 이름) · 카카오톡 안에서는 캘린더 버튼이 기본 브라우저로 넘김(`?cal=`, 2026-11-10 sw 10c)
- 판정 문구는 "입력한 조건으로는 … 보여요" + 예비 판정 줄 · 처음 결과 볼 때 이용약관(`terms.html`) 확인 한 번 (키 `cheongyak-check-terms`)
- 공고 출처: LH·마이홈포털 공공데이터 API + SH 공고 게시판 + 서울 청년안심주택 모집공고 목록 + 단지 직접(엘리스, `scripts/sources/`) (서울만)
  - 게시판(SH·청년안심)은 목록에서 제목·기관·날짜·원문 링크 · 2026-11-16 부터 공고문 PDF 를 받아 Gemini 요약을 상세로 저장(PDF 원본은 저장 안 함) · 같은 사이트 요청 3초 간격 · 실행마다 robots.txt 확인 · 실제 실행 하루 약 4번
- 공고 상세(신청 조건 요약): 마이홈은 API 기본 정보 · SH·청년안심은 공고문 PDF → Gemini 요약 + 진단용 값(notice → '진단 →' 바로 결과) (2026-11-16, `docs/design/공고상세.md`) · 엘리스·LH 는 공고문 경로 없음 → '공고 원문 보기'
- 사용자 PDF 올리기(진단용 값 읽기): 15MB 까지 (사이트 + sjcu Worker `MAX_PDF` · 2026-11-16, Worker 배포는 사용자)
- 검사 (2026-11-16 마지막: check 190/190 · detail 65/65 · sjcu worker_check 14/14) (2026-11-15): `python scripts/verify/check.py` 165/165 (판정 동등성은 기준 파일 있는 PC 에서만) · `map_check.py` 32 · `csp_check.py` 7 · `node scripts/verify/tools_check.mjs` 33 · `detail_check.mjs` 57 · `feed_check.mjs` 25 · `danji_check.mjs` 30 · `app_bridge_check.mjs` 32 · `cron_check.mjs` 5 · `sw_redirect_check.mjs` 10 (Pages 308 + 서비스 워커)
  - 한글 Windows 에서는 `PYTHONUTF8=1 PYTHONIOENCODING=utf-8` 를 붙여야 출력이 안 깨지고 check.py 가 cp949 오류를 안 냄
  - 판정 동등성 검사는 `../sjcu/index_v28_backup.html`(SUITABLE HOME 마지막 청약 버전)이 있는 PC 에서만 돈다
  - check.py 의 파일 불러오기·PDF 항목이 가끔 타이밍으로 NG → 다시 돌리면 OK

## 구조 (데이터 흐름)

```
GitHub Actions '공고 피드' (매시 :17 schedule + Cloudflare Worker 매시 :47 · 최근 5시간 50분 안에 실제 갱신했으면 건너뜀 = 하루 약 4번)
  scripts/feed.mjs     공고 목록 (LH·마이홈 API, SH 게시판, 청년안심주택 JSON + 본문의 청약신청·발표 줄) → 서울만 · 마감 지난 것은 30일까지(완료 탭) · 시작일만 아는 것은 7일까지 · 정정공고면 예전 것 숨김
  scripts/detail.mjs   공고 상세: PDF + 게시판 본문 → Gemini(첫 모델 하루 18번 · 새 공고는 lite) → feed/detail/{id}.json
  scripts/sources/elyes.mjs  단지 직접 공고 (엘리스 · 제목·날짜·링크만 · 별칭 표로 서울 단지만)
  scripts/danji.mjs    단지 정보 하루 1번: 서울시 목록 · view.do(새 단지·좌표 없는 단지 매일·전체 7일 · 시행사·홈페이지·전화·건물 좌표 ll) · 게시판 이력 → feed/danji.json · danji_bbs.json
  scripts/enrich.mjs   공개 정보 구조화: 일정(ev) · 자격 기준(cr) · 주택형(ty) · 역(st) → notices.json · 구독 캘린더 feed/calendar.ics
사이트 index.html + lib/feed-tools.js (브라우저에서만): 신청 가능 배지 · 세부 탭·검색 · .ics 만들기 · 관심 공고(★) · 진단
```

- 내 입력(생년월일·소득·자산·관심 공고)은 브라우저 localStorage 에만. 서버로 보내지 않음
- 상세 파일 주요 칸: `model`·`readAt`(누가 언제 읽었나) · `src`(원문 해시) · `att`(첨부 식별자) · `seq`(.ics SEQUENCE) · `near`(본문의 역·출구) · `addr` · `defer`(미룸 횟수)
- 상태 파일(feed/detail/): `_quota.json`(첫 모델 오늘 사용 수) · `_fail.json`(실패·미룸) · `_compare.jsonl`(lite↔첫 모델 비교) · `_seq.json` / feed/: `geo.json`(좌표) · `stations.json`(OSM 서울 지하철역)

## 운영 방법

- 손으로 갱신: `gh workflow run feed.yml` (손으로 돌리면 건너뛰기 없이 항상 돈다) · 결과 `gh run view <id> --log`
- 로그에서 볼 줄: `상세 · 첫 모델 오늘 사용 N/18` · `Gemini 호출 · …` · `꾸미기 · 일정 … 역 …` · `상세 · …: lite↔첫 모델 비교 …`
- 정기 실행 간격 표: `node scripts/verify/schedule_report.mjs` (예정 대비 지연 · 건너뜀 · 안 돈 회차, :17 GitHub / :47 Cloudflare)
- 진단 실행: Actions → 공고 피드 → Run workflow → `probe`(LH API) · `probe_myhome`(마이홈 API 응답 칸)
- 상세가 줄어들었을 때 복구: `node scripts/restore_details.mjs --dry` → 확인 후 `--dry` 없이 (원문 해시가 같은 버전끼리만 · AI 안 씀)
- **로컬에서는 실제 Gemini 를 부르지 않는다**: detail.mjs 는 Actions·검사(`DETAIL_TEST=1`)에서만 부름. 꼭 필요하면 `DETAIL_ALLOW_REAL=1` → 그 호출도 `_quota.json` 에 더해지니 끝나면 `_quota.json` 커밋·push
- **index.html 인라인 스크립트를 고치면 `python scripts/csp.py --write`** (`_headers` CSP 해시 · check.py 가 다르면 NG) · 브라우저 확인 `python scripts/verify/csp_check.py`
- `lib/` 를 바꾸면 sw.js VERSION 을 올리고 index.html 의 `lib/feed-tools.js?v=` 도 같은 값으로 (check.py 가 확인)
- push 전에 항상 `git pull --rebase origin main` (Actions 가 피드 커밋을 자주 올림)
- Claude Code 훅 (2026-11-18, `.claude/settings.json` → `.claude/hooks/guard.py`): 커밋 전 check.py 정적 검사 · Co-Authored-By 막음 · push 전 origin/main 이 HEAD 에 들어 있는지 확인 → 어기면 명령을 막고 이유를 돌려줌 · 끄기·보기는 `/hooks`

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
- [ ] 역 거리 정확도: 국내 지오코더(브이월드·카카오) 키가 있으면 바꾸기 · 역 좌표를 서울시 공공데이터로 바꾸려면 인증키 필요 (지금은 OSM) · 단지는 이제 건물 좌표(ll)가 있으니 '가까운 역 거리'도 ll 로 다시 셀 수 있음
- [ ] 엘리스 새 서울 단지가 생기면 `scripts/sources/elyes.mjs` 표에 `ll` 도 (엘리스 단지 화면 지도 값) · 없으면 그 단지는 역 핀
- [ ] SH·LH 공고는 단지와 연결이 안 돼 지도에서 역 핀 (건물 점 아님)
- [ ] 특이사항 점수: 한부모·부모 밑 세대·부모님 재정 등 공고별 가점을 판정에 넣을지 (실사용자 질문, 2026-11-06)
- [ ] 상세 다음 단계: '이 공고로 내 조건 진단' 버튼(판정용 공고 JSON 도 읽기) · LH 공고문 PDF 찾기
- [ ] 신청 가능 배지: '기타 조건'(청약자=계약자 동일인 등)은 판정하지 않음 → 이대로 둘지
- [ ] 진단용 값(AI)의 소득 기준표: 단위는 자동 보정(원·천원 → 만원, 2026-11-16) · 100% 대신 120% 표를 읽은 경우(sh-312351 의심)는 못 잡음 → 기준표가 2026 고시값(1인 381.3 · 2인 586.6 …)과 크게 다르면 경고할지
- [ ] 정정공고 표시는 이름이 겹칠 때만 잡힘 (피드 제목과 공고 이름이 많이 다르면 놓침)
- [x] SUITABLE HOME 에서 청약 화면을 뺌 (2026-11-09, SUITABLE HOME v28) · 메뉴 링크 '청약 체크 ↗' 는 2027-01-20 까지 유지
- [ ] lite↔첫 모델 비교 · 상세 다음 단계는 게시판 상세를 안 만들면서 대상이 거의 없어짐 → 계속할지 결정
- [x] 진단용 값 못 읽은 3건(youth-6706·6720·6729)은 다음 갱신에서 읽힘 (2026-11-17 확인) · sh-313268(홀몸어르신 주택)은 신혼·청년 대상이 아니라 3번 실패 후 멈춤 — 정상
- [ ] 커뮤니티 게시판(카카오·구글·네이버 간편 로그인): 설문 의견이 모인 뒤 다시 논의 (`/grill-me` 로 시작)
- [ ] Play 개발자 계정(25달러) 생기면 aab 올리기 · versionCode 는 계속 올림(지금 3)
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
