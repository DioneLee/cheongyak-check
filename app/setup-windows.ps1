# 청약 체크 앱 — Windows 개발 도구 설치 (한 번만)
#   powershell -ExecutionPolicy Bypass -File app\setup-windows.ps1
# 설치 위치 (모두 사용자 폴더 · 시스템 PATH·환경 변수는 바꾸지 않음):
#   JDK 21      이미 있으면 그대로 · 없으면 ~\.cheongyak-app\jdk-21…
#   Android SDK %LOCALAPPDATA%\Android\Sdk (cmdline-tools · platform-tools · platform/build-tools 36 · emulator · 시스템 이미지)
#   에뮬레이터  ~\.android\avd\cheongyak36.avd
#   npm 패키지  app\node_modules (Capacitor)
# Android SDK 약관(sdkmanager --licenses)에 '예'로 답한다 — 사용자 동의 2026-11-09
$ErrorActionPreference = 'Continue'   # PowerShell 5.1 은 외부 명령의 stderr 를 오류로 바꿈 → 결과는 $LASTEXITCODE·파일로 직접 확인
. "$PSScriptRoot\env-windows.ps1"
$Pkgs = @('platform-tools', 'platforms;android-36', 'build-tools;36.0.0', 'emulator', 'system-images;android-36;google_apis;x86_64')
$Avd = 'cheongyak36'
New-Item -ItemType Directory -Force $AppTools, $Sdk | Out-Null
$tmp = Join-Path $env:TEMP 'cheongyak-setup'; New-Item -ItemType Directory -Force $tmp | Out-Null
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest 가 진행 막대 때문에 아주 느려지는 것 막기

# 1) JDK 21 (Capacitor 8 Android 빌드에 필요)
if (-not (Find-Jdk21)) {
  Write-Host 'JDK 21 받는 중 (Adoptium Temurin)…'
  $zip = Join-Path $tmp 'jdk21.zip'
  Invoke-WebRequest 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile $zip
  Expand-Archive $zip -DestinationPath $AppTools -Force
  . "$PSScriptRoot\env-windows.ps1"
}
if (-not (Find-Jdk21)) { throw 'JDK 21 을 찾지 못했어요' }
Write-Host "JDK: $env:JAVA_HOME"

# 2) Android SDK 명령줄 도구 (최신 번호를 Google 저장소 목록에서 찾음)
$sdkm = Join-Path $Sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkm)) {
  Write-Host 'Android 명령줄 도구 받는 중…'
  $xml = (Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-3.xml' -UseBasicParsing).Content
  $rev = ([regex]::Matches($xml, 'commandlinetools-win-(\d+)_latest\.zip') | ForEach-Object { [long]$_.Groups[1].Value } | Measure-Object -Maximum).Maximum
  $zip = Join-Path $tmp 'cmdline-tools.zip'
  Invoke-WebRequest "https://dl.google.com/android/repository/commandlinetools-win-${rev}_latest.zip" -OutFile $zip
  $x = Join-Path $tmp 'cmdline'; Remove-Item $x -Recurse -Force -ErrorAction SilentlyContinue; Expand-Archive $zip -DestinationPath $x -Force
  New-Item -ItemType Directory -Force (Join-Path $Sdk 'cmdline-tools') | Out-Null
  Remove-Item (Join-Path $Sdk 'cmdline-tools\latest') -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item (Join-Path $x 'cmdline-tools') (Join-Path $Sdk 'cmdline-tools\latest')
}

# 3) 패키지 — 새 명령줄 도구는 android.exe (sdkmanager 는 그걸 부르는 껍데기 · 약관 단계 없음), 예전 도구면 sdkmanager --licenses
#    android.exe 는 끝날 때 0 이 아닌 값을 돌려줄 때가 있어서 → 설치 뒤 폴더로 확인한다
Write-Host 'Android SDK 패키지 설치 중 (처음이면 수 GB)…'
$cli = Join-Path $Sdk 'cmdline-tools\latest\bin\android.exe'
if (Test-Path $cli) {
  & $cli sdk install @($Pkgs | ForEach-Object { $_ -replace ';', '/' }) 2>&1 | Out-Null
} else {
  ("y`n" * 30) | & $sdkm --licenses 2>&1 | Out-Null
  & $sdkm --install @($Pkgs | ForEach-Object { '"' + $_ + '"' }) 2>&1 | Out-Null   # 따옴표: .bat 로 넘길 때 ';' 에서 잘리지 않게
}
$miss = $Pkgs | Where-Object { -not (Test-Path (Join-Path $Sdk ($_ -replace ';', '\'))) }   # 설치 확인은 폴더로
if ($miss) { throw "설치 안 된 패키지: $($miss -join ', ')" }

# 4) 에뮬레이터 (없을 때만)
$avdm = Join-Path $Sdk 'cmdline-tools\latest\bin\avdmanager.bat'
if (-not ((& $avdm list avd -c 2>$null) -contains $Avd)) {
  'no' | & $avdm create avd -n $Avd -k 'system-images;android-36;google_apis;x86_64' -d pixel_7 2>&1 | Out-Null
  if (-not ((& $avdm list avd -c 2>$null) -contains $Avd)) { throw '에뮬레이터를 만들지 못했어요' }
}

# 5) Capacitor (app\node_modules)
Push-Location $PSScriptRoot; try { npm ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm ci 실패' } } finally { Pop-Location }
Write-Host '설치 끝. 다음: powershell -ExecutionPolicy Bypass -File app\build-android.ps1'
