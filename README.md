# 청약 체크 (가칭) — 내 상황으로 보는 청약 예비 진단

공고문 PDF를 올리거나 공고를 고르고 몇 가지 질문에 답하면, 신청할 수 있는지(신호등)와 실제 한 달 부담을 보여 주는 웹앱(PWA).
SUITABLE HOME(https://dionelee.github.io/suitable-home/)의 청약 화면을 따로 뗐다. 판정·계산·AI 읽기 코드는 그대로 옮겼고, 두 사이트 결과가 같은지 자동 검사한다.

- 주소(배포 후): https://dionelee.github.io/cheongyak-check/
- 단일 `index.html` + CDN(Pretendard)만 · 빌드 없음
- 입력(생년월일·소득·자산)은 이 기기 localStorage `cheongyak-check-v1` 에만. 회원가입·서버 저장·방문자 분석 없음
- 지역: **서울 공고만** (피드·공고 추가·가져오기 모두)
- 유형: 신혼부부 · 청년(미혼). 일반·생애최초는 "준비 중" 표시만

## 파일

| 파일 | 하는 일 |
|---|---|
| `index.html` | 화면 전체 (디자인 토큰은 맨 위 `:root`) |
| `terms.html` | 이용약관 (처음 결과 볼 때 확인 · 바꾸면 index.html 의 `TERMS_V` 도) |
| `manifest.webmanifest`, `icons/` | 홈 화면에 추가(PWA). 아이콘은 임시본 — 디자인 담당이 교체 |
| `sw.js` | index.html·공고 피드는 인터넷 먼저, 실패할 때만 저장본. 배포 때 `VERSION` 을 바꾼다 |
| `feed/notices.json` | 새로 올라온 공고 (GitHub Actions 가 갱신) |
| `scripts/feed.mjs` | 마이홈포털·LH 공식 API → 피드. SH·청년안심주택은 원문 링크만 |
| `.github/workflows/feed.yml` | 3시간마다 피드 갱신 · 바뀌었을 때만 커밋 |
| `samples/` | 시연용 예시 공고, 테스트용 예시 PDF |

## 처음 설정 (저장소 주인이 할 일)

1. GitHub 저장소 `cheongyak-check` 만들고 push → Settings → Pages → Branch `main` / root
2. Settings → Secrets and variables → Actions → `DATA_GO_KR_KEY` (공공데이터포털 인증키, 마이홈포털 15108420·LH 15058530 활용신청 필요)
3. Actions → "공고 피드" → Run workflow 로 한 번 돌려 확인

## 검사

```bash
python scripts/verify/check.py        # 기능·휴대폰·가져오기·SUITABLE HOME 과 판정 동등성·서비스 워커 (테스트 서버를 스스로 띄움, 8766·8767)
node scripts/verify/feed_check.mjs    # 피드 스크립트 (가짜 응답)
python scripts/verify/shots.py        # 화면 사진 screenshots/
```
필요: Python 3 + Pillow, Node 20+, Chrome. 판정 동등성은 옆 폴더 `../sjcu`(SUITABLE HOME) 가 있을 때만.

AI 읽기는 SUITABLE HOME 과 같은 Cloudflare Worker(`suitable-home-ai`)를 쓴다. 같은 주소(dionelee.github.io)라 Worker 설정을 바꿀 필요가 없다. 다른 도메인으로 옮기면 Worker 의 `ORIGINS` 에 새 주소를 넣어야 한다.
