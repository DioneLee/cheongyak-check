// 웹 파일 → 앱 화면(app/www) 복사 + 앱 ID 반영. 웹을 고치면 이것 한 번이면 앱 화면이 같아진다 (빌드 스크립트가 먼저 부른다)
//   node app/sync-web.mjs        (app/sync-web.ps1 · app/sync-web.sh 도 이걸 부른다)
// 1) 저장소 맨 위의 웹 파일만 복사 (sw.js 는 빼고: 앱은 화면 파일이 앱 안에 있어 서비스 워커가 필요 없음)
// 2) www/index.html 맨 앞에 app-bridge.js (bridge.js) 를 넣는다 — 웹사이트 index.html 은 그대로
// 3) capacitor.config.json 의 appId · appName 을 Android(build.gradle · strings.xml)와 iOS(project.pbxproj)에 반영 — 앱 ID 는 config 한 곳에서만 바꾼다
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = dirname(fileURLToPath(import.meta.url)), WEB = join(APP, '..'), OUT = join(APP, 'www');
const FILES = ['index.html', 'terms.html', 'privacy.html', 'manifest.webmanifest', 'lib', 'icons', 'samples/notice_yongsan.json'];

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
for (const f of FILES) { mkdirSync(dirname(join(OUT, f)), { recursive: true }); cpSync(join(WEB, f), join(OUT, f), { recursive: true }); }
cpSync(join(APP, 'bridge.js'), join(OUT, 'app-bridge.js'));
const ip = join(OUT, 'index.html'), html = readFileSync(ip, 'utf8'), MARK = '<meta charset="utf-8">';
if (html.split(MARK).length !== 2) throw new Error(`index.html 에 ${MARK} 가 정확히 한 번 있어야 해요`);
writeFileSync(ip, html.replace(MARK, `${MARK}\n<script src="app-bridge.js"></script>`));

const cfg = JSON.parse(readFileSync(join(APP, 'capacitor.config.json'), 'utf8')), id = cfg.appId, name = cfg.appName;
if (!/^[a-z][\w]*(\.[a-z][\w]*)+$/.test(id)) throw new Error(`appId 형식이 이상해요: ${id}`);
const patch = (file, pairs) => {
  if (!existsSync(file)) return false;
  let t = readFileSync(file, 'utf8');
  for (const [re, to] of pairs) { if (!re.test(t)) throw new Error(`${file}: ${re} 를 못 찾음`); t = t.replace(re, to); }
  writeFileSync(file, t); return true;
};
const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const done = [
  patch(join(APP, 'android/app/build.gradle'), [[/applicationId "[^"]*"/, `applicationId "${id}"`]]) && 'android build.gradle',
  patch(join(APP, 'android/app/src/main/res/values/strings.xml'), [
    [/(<string name="app_name">)[^<]*(<\/string>)/, `$1${xml(name)}$2`], [/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${xml(name)}$2`],
    [/(<string name="package_name">)[^<]*(<\/string>)/, `$1${id}$2`], [/(<string name="custom_url_scheme">)[^<]*(<\/string>)/, `$1${id}$2`]]) && 'android strings.xml',
  patch(join(APP, 'ios/App/App.xcodeproj/project.pbxproj'), [[/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${id};`]]) && 'ios project.pbxproj',
].filter(Boolean);
console.log(`앱 화면 복사 끝: ${FILES.length}개 → app/www · 앱 ID ${id}${done.length ? ` → ${done.join(', ')}` : ''}`);
