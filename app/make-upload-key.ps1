# 청약 체크 앱 — Play 업로드 키 만들기 (한 번만 · 사용자가 직접 실행)
#   powershell -ExecutionPolicy Bypass -File app\make-upload-key.ps1
# 키 파일: ~\.cheongyak-app\keys\cheongyak-upload.jks (저장소 밖) · 별칭 upload
# 비밀번호와 이름 등은 keytool 이 직접 물어본다 → 이 스크립트·로그·파일 어디에도 남지 않음. 비밀번호는 비밀번호 관리자에 보관
$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\env-windows.ps1"
$dir = Join-Path $AppTools 'keys'; $key = Join-Path $dir 'cheongyak-upload.jks'
if (Test-Path $key) { Write-Host "이미 있어요: $key (덮어쓰지 않음)" -ForegroundColor Yellow; exit 1 }
New-Item -ItemType Directory -Force $dir | Out-Null
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore $key -alias upload -keyalg RSA -keysize 4096 -validity 10000
if ($LASTEXITCODE) { exit 1 }
Write-Host "만들었어요: $key"
Write-Host '이 파일을 잃어버리면 Play Console 에서 업로드 키 재설정을 요청해야 해요. USB나 개인 클라우드에 한 벌 더 두세요.'
