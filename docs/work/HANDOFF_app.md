# 인수인계 — 청약 체크 앱 (Android · iOS) · 마지막 정리 2026-11-09

새 세션(집 Mac 포함)은 이 파일 → [앱 설계](../design/앱.md) → [스토어 초안](../store/스토어.md) 순서로 읽는다. 웹사이트 쪽은 [HANDOFF.md](HANDOFF.md).

## 정한 것

- **방식: Capacitor 8** (Android·iOS 같은 코드). Bubblewrap/TWA·assetlinks.json·`dionelee.github.io` 저장소는 하지 않음
  - Capacitor 로 정한 이유: ① 관심 공고 마감 알림을 기기 안에서 정해진 시각에 확실히 울릴 수 있음(TWA 는 웹 알림뿐 → 서버에 구독 저장이 필요해 '서버 저장 없음' 원칙과 충돌) ② iOS 도 (b) 방식(앱 안 화면 + 앱 기능)이라 두 앱 코드가 같음 ③ 도메인 확인 파일·새 저장소가 필요 없음 (2026-11-09 사용자 결정)
- **앱 ID: 테스트용 `io.github.dionelee.cheongyakcheck.dev`** — 정식 ID 는 도메인을 정한 뒤. 바꾸는 곳은 `app/capacitor.config.json` 의 `appId` **한 곳**. `sync-web` 이 Android `build.gradle`·`strings.xml`, iOS `project.pbxproj` 에 반영
  - Android `namespace`(자바 패키지 경로)는 처음 만든 값 그대로 둔다 — 스토어 ID 와 상관없음
- **iOS: (b) 방식** — 화면 파일은 앱 안, 공고 피드는 인터넷(github.io), 앱 기능 = 마감 알림·기기 저장 백업·공유 시트·오프라인 목록
- **알림**: 관심 공고(★)만 · 마감 하루 전 오전 9시 · 처음 ★ 를 켤 때 허용을 묻는다 · 정확한 알람 권한은 뺌(Play 정책) → "9시쯤"
- **저장**: 앱일 때 `cheongyak-check-v1` 을 Capacitor Preferences 에도 한 벌. localStorage 가 비면 되살림. 웹 동작은 그대로
- **도메인: 미정** (정식 앱 ID·개인정보처리방침 주소에 영향)
- **AI Worker 허용 주소**: `https://localhost`(Android)·`capacitor://localhost`(iOS) 추가 — `../sjcu/worker/src/index.js` 에 고쳐만 둠. **배포(`cd ../sjcu/worker && npx wrangler deploy`)는 사용자**. 배포 전에는 앱에서 AI 읽기가 403(origin)

## 지금 상태 (2026-11-09 Windows)

- `app/` : Capacitor 프로젝트 (`android/` 만 있음 · `ios/` 는 집에서 추가)
- Android 디버그 apk·서명 전 aab 빌드됨 (`app/dist/`, 저장소에 안 올림)
- 에뮬레이터(Android 16 · API 36)에서 확인: 첫 화면 · 주소창 없음 · 탭 이동 · 뒤로 버튼 · 공고 원문(외부 Chrome) · 캘린더(.ics → 공유 시트) · PDF 고르기 · 불러오기 · 내보내기(공유 시트) · 저장소 지운 뒤 되살림 · 마감 알림 예약·표시 · 오프라인(기억한 공고 목록) — 사진 `screenshots/app/`
- 업로드 키: **아직 없음** — 사용자가 `app/make-upload-key.ps1` 로 직접 만든다 (비밀번호는 keytool 이 직접 물음)

## 남은 일 (순서)

1. (사용자) Worker 배포 → 앱에서 AI 읽기 확인
2. (사용자) 업로드 키 만들기 → `build-android -Release` 로 서명된 aab
3. 집 Mac: iOS 추가 · 시뮬레이터·실제 아이폰 확인 (아래)
4. ~~알림 작은 아이콘~~ · ~~앱 실행 아이콘~~ 끝 (2026-11-09): `python app/make-icons.py` 가 웹 아이콘(icons/ 512 · maskable 512)으로 Android 실행 아이콘(adaptive 포함)·알림 실루엣(`ic_stat_cheongyak`)·시작 화면을 만든다. **1024 원본은 저장소에 없음** → iOS App Store 아이콘(1024)은 512 를 키운 것이라 흐림. 안티그래비티 원본 1024 를 `icons/icon-1024.png` 로 넣고 다시 실행
5. 정식 아이콘이 바뀌면 `make-icons.py` 다시 · Play 그래픽 이미지 1024×500 · 스토어 스크린샷 (목록: docs/store/스토어.md)
6. 실제 휴대폰에서 .ics → 캘린더 앱으로 열리는지 (에뮬레이터엔 캘린더 앱 없음). 안 되면 '파일 열기' 플러그인 검토
7. 도메인·정식 앱 ID 정하기 → `capacitor.config.json` 한 줄 → 다시 빌드
8. Play: 비공개 테스트(테스터 12명 · 14일, 2023-11 이후 개인 계정 기준 — 계정 만들 때 다시 확인) → 프로덕션
9. App Store: 심사 제출 (심사 메모는 스토어 초안에)

## 집 Mac 에서 처음 할 일

```sh
cd <저장소 위치>/cheongyak-check
git pull --rebase origin main
sh app/setup-mac.sh            # JDK 21(~/.cheongyak-app) · Android SDK(~/Library/Android/sdk) · 에뮬레이터 · app/node_modules
# Xcode: App Store 에서 설치 → 한 번 열기 → (직접) sudo xcodebuild -license accept
```

### Android (Mac)
```sh
sh app/build-android.sh                    # 디버그 apk → app/dist/
emulator -avd cheongyak36 &                # (setup 이 만든 에뮬레이터) · PATH 는 . app/env-mac.sh 후
adb install -r app/dist/io.github.dionelee.cheongyakcheck.dev-debug.apk
adb shell monkey -p io.github.dionelee.cheongyakcheck.dev 1
node scripts/verify/app_cdp.mjs "location.hash"   # 앱 화면 안에서 JS (디버그 빌드)
```

### iOS 추가 (Mac · 처음 한 번)
```sh
cd app
node sync-web.mjs                 # app/www 만들기
npx cap add ios                   # Capacitor 8 은 Swift Package Manager 기본 → CocoaPods 필요 없음
node sync-web.mjs                 # iOS 프로젝트에도 앱 ID 반영 (project.pbxproj)
npx cap sync ios
npx cap open ios                  # Xcode: Signing & Capabilities 에서 Team 선택 (Apple 계정) → 시뮬레이터 ▶
# 명령줄로: npx cap run ios --target "iPhone 16"   (목록: npx cap run ios --list)
```
- `npx cap add ios` 뒤 `python app/make-icons.py` (iOS AppIcon 채움)
- 할 것: 알림 허용 문구(Info.plist 필요 없음 · 로컬 알림), 공고 원문 링크가 Safari 로 열리는지, PDF 고르기(파일 앱), 공유 시트, 뒤로 가기(iOS 는 버튼 없음 → 탭 메뉴로)
- iOS 앱 주소는 `capacitor://localhost` → Worker 허용 주소에 이미 넣어 둠(배포 후 동작)
- `app/ios/` 는 저장소에 올린다 (빌드 결과·`App/App/public` 은 .gitignore)

## Windows 와 Mac 명령 차이

| 할 일 | Windows (PowerShell) | Mac |
|---|---|---|
| 도구 설치 | `powershell -ExecutionPolicy Bypass -File app\setup-windows.ps1` | `sh app/setup-mac.sh` |
| 웹 → 앱 화면 | `powershell -File app\sync-web.ps1` (또는 `node app\sync-web.mjs`) | `sh app/sync-web.sh` |
| 디버그 빌드 | `powershell -ExecutionPolicy Bypass -File app\build-android.ps1` | `sh app/build-android.sh` |
| 서명 aab | `… build-android.ps1 -Release` | `sh app/build-android.sh --release` |
| 업로드 키 만들기 | `powershell -ExecutionPolicy Bypass -File app\make-upload-key.ps1` | (Windows 에서 만든 키를 옮겨 씀) |
| 이 창에서만 PATH | `. app\env-windows.ps1` | `. app/env-mac.sh` |
| adb 위치 | `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` | `~/Library/Android/sdk/platform-tools/adb` |
| 에뮬레이터 | `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd cheongyak36` | `emulator -avd cheongyak36` |
| Git Bash 에서 adb push | 앞에 `MSYS_NO_PATHCONV=1` (`/sdcard` 를 Windows 경로로 바꿔 버림) | 필요 없음 |

## 업로드 키

- 파일 이름: `cheongyak-upload.jks` (별칭 `upload`)
- 이 PC 의 위치: `%USERPROFILE%\.cheongyak-app\keys\cheongyak-upload.jks` (저장소 밖 · 아직 안 만듦)
- 집으로 옮기기: USB 또는 개인 클라우드로 같은 경로 `~/.cheongyak-app/keys/` 에 복사
- 비밀번호: 비밀번호 관리자에. 채팅·파일·커밋 어디에도 남기지 않는다

## 사용자가 직접 할 일

- [ ] Google Play 개발자 계정 (25달러 · 한 번) · Apple Developer Program (연 99달러)
- [x] 개발자 이름 "청약 체크 운영자" · 문의 GitHub Issues 로 채움 (2026-11-09) · 전용 이메일로 바꿀 곳은 `docs/store/스토어.md` '바꿀 곳'. Play 는 연락 이메일이 필수라 계정 이메일 하나는 필요
- [ ] 도메인 정하기 → 정식 앱 ID
- [ ] 업로드 키 만들기·두 곳에 보관 · 비밀번호는 비밀번호 관리자
- [ ] Worker 배포 (`npx wrangler deploy`)
- [ ] Play 비공개 테스트 테스터 12명 모으기 (14일)
- [ ] Xcode 약관 동의 · Apple 계정 로그인(서명)

## 이 PC 에 깐 것 (2026-11-09)

| 무엇 | 위치 | 용량 | 비고 |
|---|---|---|---|
| Android Emulator | `%LOCALAPPDATA%\Android\Sdk\emulator` | 1.1GB | 오늘 새로 |
| 에뮬레이터 `cheongyak36` | `%USERPROFILE%\.android\avd\cheongyak36.avd` | 4.3GB | 오늘 새로 (지우려면 폴더와 `.ini` 삭제) |
| Capacitor 패키지 | `app\node_modules` | 63MB | 저장소 안 · .gitignore |
| Android 빌드 결과 | `app\android\app\build` · `app\dist` | 약 77MB | .gitignore |
| Gradle 라이브러리 캐시 | `%USERPROFILE%\.gradle\caches` | 따로 못 잼 (Capacitor·AndroidX 라이브러리) | 예전부터 있던 폴더에 더해짐 |
| 이미 있던 것 (그대로 씀) | JDK 21 (Program Files\Eclipse Adoptium) · Android SDK 플랫폼·빌드 도구 36 · 시스템 이미지 API 36 (4.3GB) · Gradle 8.14.3 | — | 2026-09-23 설치분 |
| 빈 폴더 | `%USERPROFILE%\.cheongyak-app` | 0 | 업로드 키 자리 |

- 시스템 PATH·환경 변수는 바꾸지 않았다 (스크립트가 그 창 안에서만 지정)
- Android SDK 약관: 사용자 동의 후 스크립트가 처리 (새 명령줄 도구는 약관 단계 없음)
