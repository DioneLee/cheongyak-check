# 청약 체크 앱 — 이 PowerShell 창 안에서만 JAVA_HOME · ANDROID_HOME · PATH 를 잡는다 (시스템 환경 변수는 건드리지 않음)
# 다른 스크립트가 맨 앞에서 불러 쓴다:  . "$PSScriptRoot\env-windows.ps1"
$script:AppTools = Join-Path $HOME '.cheongyak-app'              # 우리가 받은 JDK · 키 파일
$script:Sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'         # Android SDK (Android Studio 기본 위치와 같음)

function Find-Jdk21 {
  $c = @()
  if ($env:JAVA_HOME) { $c += $env:JAVA_HOME }
  $c += Get-ChildItem 'C:\Program Files\Eclipse Adoptium\jdk-21*', (Join-Path $script:AppTools 'jdk-21*') -Directory -ErrorAction SilentlyContinue | ForEach-Object FullName
  foreach ($d in $c) {   # java -version 대신 release 파일을 읽는다 (PowerShell 5.1 은 stderr 출력을 오류로 바꿔서)
    $r = Join-Path $d 'release'
    if ((Test-Path (Join-Path $d 'bin\javac.exe')) -and (Test-Path $r) -and ((Get-Content $r -Raw) -match 'JAVA_VERSION="21\.')) { return $d }
  }
  return $null
}

$jdk = Find-Jdk21
if ($jdk) { $env:JAVA_HOME = $jdk }
$env:ANDROID_HOME = $script:Sdk; $env:ANDROID_SDK_ROOT = $script:Sdk
$env:PATH = (@("$env:JAVA_HOME\bin", "$script:Sdk\cmdline-tools\latest\bin", "$script:Sdk\platform-tools", "$script:Sdk\emulator") -join ';') + ';' + $env:PATH
