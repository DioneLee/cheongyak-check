# 청약 체크 앱 — Android 빌드 (Windows)
#   powershell -ExecutionPolicy Bypass -File app\build-android.ps1            → 에뮬레이터용 디버그 apk
#   powershell -ExecutionPolicy Bypass -File app\build-android.ps1 -Release   → 위 + Play 업로드용 aab (업로드 키로 서명 · 비밀번호는 jarsigner 가 직접 물음)
# 순서: sync-web (웹 → app/www · 앱 ID 반영) → cap sync android → gradle → app\dist\ 로 모음
param([switch]$Release)
$ErrorActionPreference = 'Continue'   # PowerShell 5.1: 외부 명령 stderr 를 오류로 바꾸지 않게 · 결과는 $LASTEXITCODE 로 확인
. "$PSScriptRoot\env-windows.ps1"
function Must($what) { if ($LASTEXITCODE) { Write-Host "실패: $what" -ForegroundColor Red; Pop-Location; exit 1 } }
if (-not $env:JAVA_HOME) { Write-Host 'JDK 21 이 없어요. 먼저 app\setup-windows.ps1' -ForegroundColor Red; exit 1 }

Push-Location $PSScriptRoot
node sync-web.mjs; Must 'sync-web'
npx cap sync android; Must 'cap sync android'
$dist = Join-Path $PSScriptRoot 'dist'; New-Item -ItemType Directory -Force $dist | Out-Null
Push-Location android
.\gradlew.bat --console=plain assembleDebug; Must 'assembleDebug'
if ($Release) { .\gradlew.bat --console=plain bundleRelease; Must 'bundleRelease' }
Pop-Location

$id = (Get-Content capacitor.config.json -Raw | ConvertFrom-Json).appId
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk (Join-Path $dist "$id-debug.apk") -Force
Write-Host "디버그 apk: $dist\$id-debug.apk"
if ($Release) {
  $aab = Join-Path $dist "$id-release.aab"
  Copy-Item android\app\build\outputs\bundle\release\app-release.aab $aab -Force
  $key = Join-Path $AppTools 'keys\cheongyak-upload.jks'
  if (Test-Path $key) {
    Write-Host '업로드 키로 서명합니다. 키 비밀번호를 물으면 입력하세요 (어디에도 저장되지 않음).'
    & "$env:JAVA_HOME\bin\jarsigner.exe" -sigalg SHA256withRSA -digestalg SHA-256 -keystore $key $aab upload; Must 'jarsigner'
    Write-Host "Play 업로드용 aab (서명됨): $aab"
  } else { Write-Host "서명 안 된 aab: $aab  (업로드 키가 없어요 → app\make-upload-key.ps1)" -ForegroundColor Yellow }
}
Pop-Location
