#!/bin/sh
# 청약 체크 앱 — Mac 개발 도구 설치 (한 번만)
#   sh app/setup-mac.sh
# 설치 위치 (모두 사용자 폴더 · 셸 설정 파일·시스템은 바꾸지 않음):
#   JDK 21      이미 있으면 그대로 · 없으면 ~/.cheongyak-app/jdk-21…
#   Android SDK ~/Library/Android/sdk (명령줄 도구 · platform-tools · platform/build-tools 36 · emulator · 시스템 이미지)
#   에뮬레이터  ~/.android/avd/cheongyak36.avd   (Apple 실리콘이면 arm64 이미지)
#   npm 패키지  app/node_modules (Capacitor)
# 직접 할 것: Xcode (App Store) 설치 후 한 번 열어 추가 구성요소 설치 · Node 22 이상 (없으면 https://nodejs.org)
# Android SDK 약관에 '예'로 답한다 — 사용자 동의 2026-11-09
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; . "$HERE/env-mac.sh"
ARCH="$(uname -m)"; [ "$ARCH" = arm64 ] && IMG_ARCH=arm64-v8a || IMG_ARCH=x86_64
PKGS="platform-tools platforms;android-36 build-tools;36.0.0 emulator system-images;android-36;google_apis;$IMG_ARCH"
AVD=cheongyak36
mkdir -p "$APP_TOOLS" "$SDK"; TMP="$(mktemp -d)"

command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || { echo "Node 22 이상이 필요해요 (https://nodejs.org)"; exit 1; }

# 1) JDK 21
if [ -z "$JAVA_HOME" ]; then
  echo "JDK 21 받는 중 (Adoptium Temurin)…"
  [ "$ARCH" = arm64 ] && JA=aarch64 || JA=x64
  curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/mac/$JA/jdk/hotspot/normal/eclipse" -o "$TMP/jdk.tar.gz"
  tar -xzf "$TMP/jdk.tar.gz" -C "$APP_TOOLS"
  . "$HERE/env-mac.sh"
fi
[ -n "$JAVA_HOME" ] || { echo "JDK 21 을 찾지 못했어요"; exit 1; }
echo "JDK: $JAVA_HOME"

# 2) Android 명령줄 도구
if [ ! -d "$SDK/cmdline-tools/latest" ]; then
  echo "Android 명령줄 도구 받는 중…"
  REV="$(curl -fsSL https://dl.google.com/android/repository/repository2-3.xml | grep -o 'commandlinetools-mac-[0-9]*_latest.zip' | grep -o '[0-9]\{5,\}' | sort -n | tail -1)"
  curl -fsSL "https://dl.google.com/android/repository/commandlinetools-mac-${REV}_latest.zip" -o "$TMP/ct.zip"
  unzip -q "$TMP/ct.zip" -d "$TMP/ct"; mkdir -p "$SDK/cmdline-tools"; mv "$TMP/ct/cmdline-tools" "$SDK/cmdline-tools/latest"
fi

# 3) 패키지 (새 도구는 android 명령, 예전 도구는 sdkmanager) · 설치 확인은 폴더로
echo "Android SDK 패키지 설치 중 (처음이면 수 GB)…"
if [ -x "$SDK/cmdline-tools/latest/bin/android" ]; then
  "$SDK/cmdline-tools/latest/bin/android" sdk install $(echo "$PKGS" | tr ';' '/') >/dev/null 2>&1 || true
else
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  sdkmanager $PKGS
fi
for p in $PKGS; do [ -d "$SDK/$(echo "$p" | tr ';' '/')" ] || { echo "설치 안 된 패키지: $p"; exit 1; }; done

# 4) 에뮬레이터
avdmanager list avd -c 2>/dev/null | grep -qx "$AVD" || echo no | avdmanager create avd -n "$AVD" -k "system-images;android-36;google_apis;$IMG_ARCH" -d pixel_7

# 5) Capacitor
(cd "$HERE" && npm ci --no-audit --no-fund)
xcode-select -p >/dev/null 2>&1 || echo "※ Xcode 가 아직 없어요: App Store 에서 설치 → 한 번 열기 → sudo xcodebuild -license accept (직접)"
echo "설치 끝. 다음: sh app/build-android.sh  ·  iOS 는 docs/work/HANDOFF_app.md 의 'iOS 추가'"
