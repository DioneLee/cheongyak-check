"""앱 아이콘 만들기 — 웹 아이콘(icons/, 안티그래비티 원본)에서 Android(·iOS) 아이콘을 만든다
   python app/make-icons.py
- 실행 아이콘: icon-512.png(둥근 사각형) → mipmap-*/ic_launcher.png · 원형은 maskable 을 원으로 잘라 ic_launcher_round.png
- adaptive icon(Android 8+): 전경 = icon-maskable-512.png 를 82% 로 줄여 가운데(108dp) · 배경 = maskable 가장자리 색
- 알림 작은 아이콘: maskable 의 집·체크 모양(밝은 부분)만 흰색 단색 실루엣 → drawable-*/ic_stat_cheongyak.png
- 시작 화면(splash): maskable 배경색 + 가운데 로고
- iOS(app/ios 가 있으면): AppIcon 1024 — 지금은 512 원본을 키운 것 (1024 원본이 오면 SRC_1024 에 넣고 다시 실행)
원본이 바뀌면 이것만 다시 돌리면 된다.
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter
sys.stdout.reconfigure(encoding="utf-8")

APP = Path(__file__).resolve().parent; WEB = APP.parent / "icons"; RES = APP / "android/app/src/main/res"
ICON, MASK = Image.open(WEB / "icon-512.png").convert("RGBA"), Image.open(WEB / "icon-maskable-512.png").convert("RGBA")
SRC_1024 = WEB / "icon-1024.png"   # 있으면 iOS 에 씀
BG = MASK.getpixel((4, 4))[:3]     # 가장자리 초록
DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
fit = lambda im, px: im.resize((px, px), Image.LANCZOS)

# 로고 모양 마스크: 집(밝은 흰색) + 체크(밝은 초록) — 배경 초록(G ≤ 140)보다 확실히 밝은 픽셀
#  단색이면 집과 체크가 한 덩어리가 되므로, 체크 둘레만큼 집을 깎아 틈을 둔다
r_, g_, _ = MASK.convert("RGB").split()
house = r_.point(lambda v: 255 if v > 170 else 0)
check = ImageChops.multiply(g_.point(lambda v: 255 if v > 165 else 0), r_.point(lambda v: 255 if v < 140 else 0))   # 초록이고 빨강이 낮음 = 체크
gap = check.filter(ImageFilter.MaxFilter(7))
logo = ImageChops.lighter(ImageChops.subtract(house, gap), check).filter(ImageFilter.MedianFilter(3))
box = logo.getbbox()

def silhouette(px):
    """흰색 단색 실루엣 · 투명 배경 · 정사각형 안에 여백 두고 가운데"""
    crop = logo.crop(box); s = max(crop.size); pad = round(s * 0.12)
    sq = Image.new("L", (s + 2 * pad, s + 2 * pad), 0); sq.paste(crop, (pad + (s - crop.width) // 2, pad + (s - crop.height) // 2))
    a = sq.resize((px, px), Image.LANCZOS)
    out = Image.new("RGBA", (px, px), (255, 255, 255, 0)); out.putalpha(a); return out

for d, k in DENS.items():
    m = RES / f"mipmap-{d}"; m.mkdir(exist_ok=True)
    fit(ICON, round(48 * k)).save(m / "ic_launcher.png")
    r = fit(MASK, round(48 * k)); c = Image.new("L", r.size, 0); ImageDraw.Draw(c).ellipse((0, 0, r.width - 1, r.height - 1), fill=255)
    rr = Image.new("RGBA", r.size, (0, 0, 0, 0)); rr.paste(r, (0, 0), c); rr.save(m / "ic_launcher_round.png")
    fg_px = round(108 * k); fg = Image.new("RGBA", (fg_px, fg_px), BG + (255,)); inner = fit(MASK, round(fg_px * 0.82))   # 원형 안에서 로고가 꽉 차 보이지 않게 82%
    fg.paste(inner, ((fg_px - inner.width) // 2, (fg_px - inner.height) // 2)); fg.save(m / "ic_launcher_foreground.png")
    dr = RES / f"drawable-{d}"; dr.mkdir(exist_ok=True)
    silhouette(round(24 * k)).save(dr / "ic_stat_cheongyak.png")
(RES / "values/ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#%02X%02X%02X</color>\n</resources>\n' % BG, encoding="utf-8")

# 시작 화면: 크기는 Capacitor 가 만든 파일 그대로, 배경색 + 가운데 로고(짧은 변의 40%)
for sp in RES.glob("drawable*/splash.png"):
    w, h = Image.open(sp).size; out = Image.new("RGB", (w, h), BG)
    lg = fit(MASK, round(min(w, h) * 0.4)); out.paste(lg, ((w - lg.width) // 2, (h - lg.height) // 2)); out.save(sp)

ios = APP / "ios/App/App/Assets.xcassets/AppIcon.appiconset"
if ios.exists():
    src = Image.open(SRC_1024).convert("RGB") if SRC_1024.exists() else fit(MASK, 1024).convert("RGB")   # iOS 는 투명·둥근 모서리 없이 꽉 찬 사각형
    for f in ios.glob("*.png"): src.resize(Image.open(f).size, Image.LANCZOS).save(f)
    print("iOS AppIcon:", "1024 원본" if SRC_1024.exists() else "512 를 키운 것 (1024 원본으로 바꾸기)")
print(f"Android 아이콘 끝 · 배경 #{'%02X%02X%02X' % BG} · 로고 영역 {box}")
