# 웹 파일 → 앱 화면(app/www) 복사 + 앱 ID 반영 (내용은 sync-web.mjs)
node "$PSScriptRoot\sync-web.mjs"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
