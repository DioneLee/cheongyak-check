# 청약 체크 앱 — 이 터미널 안에서만 JAVA_HOME · ANDROID_HOME · PATH (셸 설정 파일은 건드리지 않음)
# 다른 스크립트가 맨 앞에서 불러 쓴다:  . "$(dirname "$0")/env-mac.sh"
APP_TOOLS="$HOME/.cheongyak-app"                 # 우리가 받은 JDK · 키 파일
SDK="$HOME/Library/Android/sdk"                  # Android SDK (Android Studio 기본 위치와 같음)
find_jdk21() {
  for d in "$JAVA_HOME" "$APP_TOOLS"/jdk-21*/Contents/Home /Library/Java/JavaVirtualMachines/*21*/Contents/Home; do
    [ -n "$d" ] && [ -x "$d/bin/javac" ] && grep -q 'JAVA_VERSION="21\.' "$d/release" 2>/dev/null && { echo "$d"; return 0; }
  done
  return 1
}
JDK="$(find_jdk21)" && export JAVA_HOME="$JDK"
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$SDK/emulator:$PATH"
