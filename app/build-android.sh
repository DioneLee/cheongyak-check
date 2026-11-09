#!/bin/sh
# 청약 체크 앱 — Android 빌드 (Mac · Linux)
#   sh app/build-android.sh            → 에뮬레이터용 디버그 apk
#   sh app/build-android.sh --release  → 위 + Play 업로드용 aab (업로드 키로 서명 · 비밀번호는 jarsigner 가 직접 물음)
# 순서: sync-web (웹 → app/www · 앱 ID 반영) → cap sync android → gradle → app/dist/ 로 모음
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; . "$HERE/env-mac.sh"
[ -n "$JAVA_HOME" ] || { echo "JDK 21 이 없어요. 먼저 sh app/setup-mac.sh"; exit 1; }
cd "$HERE"
node sync-web.mjs
npx cap sync android
mkdir -p dist
(cd android && ./gradlew --console=plain assembleDebug && { [ "$1" != --release ] || ./gradlew --console=plain bundleRelease; })
ID="$(node -p "require('./capacitor.config.json').appId")"
cp android/app/build/outputs/apk/debug/app-debug.apk "dist/$ID-debug.apk"; echo "디버그 apk: $HERE/dist/$ID-debug.apk"
if [ "$1" = --release ]; then
  AAB="dist/$ID-release.aab"; cp android/app/build/outputs/bundle/release/app-release.aab "$AAB"
  KEY="$APP_TOOLS/keys/cheongyak-upload.jks"
  if [ -f "$KEY" ]; then
    echo "업로드 키로 서명합니다. 키 비밀번호를 물으면 입력하세요 (어디에도 저장되지 않음)."
    "$JAVA_HOME/bin/jarsigner" -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KEY" "$AAB" upload
    echo "Play 업로드용 aab (서명됨): $HERE/$AAB"
  else echo "서명 안 된 aab: $HERE/$AAB  (업로드 키가 없어요 → app/make-upload-key.ps1 로 만든 키를 $KEY 로 옮기기)"; fi
fi
