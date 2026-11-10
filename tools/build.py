#!/usr/bin/env python3
"""Bundle Pocket Stats into single self-contained HTML files.

  dist/PocketStats.html      Full offline app you can download and keep.
                             Strict CSP: inline code is allowed only by exact
                             SHA-256 hash; network only to the two food databases.
  android/app/assets/index.html  Same as PocketStats.html, packaged into the Android APK.
  dist/pocket-stats-web.html Page body for the claude.ai web-link version
                             (hosted flag on: no service worker, no online lookups).

Usage: python3 tools/build.py
"""
import base64
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / 'js'
ENTRY = 'app.js'

IMPORT_RE = re.compile(r"^import\s+([^;]+?)\s+from\s+'\./([\w-]+)\.js';[ \t]*$", re.M)
EXPORT_RE = re.compile(r'^export\s+(?:async\s+)?(?:function\s*\*?|const|let|class)\s+([A-Za-z_$][\w$]*)', re.M)


def mod_var(name):
    return '__m_' + re.sub(r'\W', '_', name)


def load(name, seen, order):
    if name in seen:
        return
    seen.add(name)
    src = (JS / f'{name}.js').read_text()
    for _, dep in IMPORT_RE.findall(src):
        load(dep, seen, order)
    order.append((name, src))


def convert(name, src):
    exports = EXPORT_RE.findall(src)

    def imp(m):
        spec, dep = m.group(1), m.group(2)
        if spec.startswith('* as '):
            return f'const {spec[5:].strip()} = {mod_var(dep)};'
        names = spec.strip().strip('{}').replace('\n', ' ')
        names = ', '.join(p.strip().replace(' as ', ': ') for p in names.split(',') if p.strip())
        return f'const {{ {names} }} = {mod_var(dep)};'

    body = IMPORT_RE.sub(imp, src)
    body = re.sub(r'^export\s+', '', body, flags=re.M)
    return f'const {mod_var(name)} = (() => {{\n{body}\nreturn {{ {", ".join(exports)} }};\n}})();\n'


def bundle(hosted, local_data=None):
    order = []
    load(ENTRY.removesuffix('.js'), set(), order)
    code = '"use strict";\nglobalThis.POCKET_STATS_BUNDLED = true;\n'
    if hosted:
        code += 'globalThis.POCKET_STATS_HOSTED = true;\n'
    if local_data:
        code += f'globalThis.POCKET_STATS_LOCAL_DATA = true;\nglobalThis.POCKET_STATS_DATA_VERSION = "{local_data}";\n'
    code += ''.join(convert(n, s) for n, s in order)
    if local_data:
        # The Android app reads its data from its own files: remove the repo address entirely.
        code = re.sub(r"'https://(raw\.githubusercontent\.com|api\.github\.com)/[^']*'", "''", code)
    return code


def bundle_data(dest):
    """Copy the food list, ingredient lists, scanner model and photos (as small WebP) into the APK."""
    import json as _json
    import shutil
    from PIL import Image
    data = ROOT / 'data'
    if dest.exists():
        shutil.rmtree(dest)
    (dest / 'img').mkdir(parents=True)
    shutil.copytree(data / 'ing', dest / 'ing')
    shutil.copytree(data / 'ml' / 'mobilenet_v2_0.35_224', dest / 'ml' / 'mobilenet_v2_0.35_224')
    db = _json.loads((data / 'foods-morocco.json').read_text())
    cache = ROOT / 'android' / '.cache' / 'img'
    for f in db['foods']:
        img = f.get('img')
        if not img:
            continue
        rel = Path(img).with_suffix('.webp')
        cached = cache / rel.relative_to('img')
        if not cached.exists() or cached.stat().st_mtime < (data / img).stat().st_mtime:
            cached.parent.mkdir(parents=True, exist_ok=True)
            im = Image.open(data / img).convert('RGB')
            im.thumbnail((128, 128))
            im.save(cached, 'WEBP', quality=65, method=6)
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(cached, out)
        f['img'] = str(rel)
    text = _json.dumps(db, ensure_ascii=False, separators=(',', ':'))
    (dest / 'foods-morocco.json').write_text(text)
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def data_uri(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def sha(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode() + "'"


def theme_css(css):
    """Follow the claude.ai theme toggle as well as the OS setting."""
    m = re.search(r'@media \(prefers-color-scheme: dark\) \{\n  :root \{(.*?)\n  \}\n\}', css, re.S)
    if not m:
        return css
    tokens = m.group(1)
    replacement = (
        '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {' + tokens + '\n    color-scheme: dark;\n  }\n}\n'
        ':root[data-theme="dark"] {' + tokens + '\n  color-scheme: dark;\n}\n'
        ':root[data-theme="light"] { color-scheme: light; }'
    )
    return css.replace(m.group(0), replacement)


def page(css, zxing, claude_sdk, tfjs, app, favicon, icon, body, connect):
    csp = ("default-src 'none'; "
           f"script-src {sha(zxing)} {sha(claude_sdk)} {sha(tfjs)} {sha(app)}; style-src {sha(css)}; "
           "img-src data: blob:; media-src blob: mediastream:; "
           f"connect-src {connect}; base-uri 'none'; form-action 'none'")
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2f7d6d">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Pocket Stats">
<title>Pocket Stats</title>
<link rel="icon" href="{favicon}">
<link rel="apple-touch-icon" href="{icon}">
<style>{css}</style>
</head>
<body>
{body}<script type="text/plain" id="lib-zxing">{zxing}</script>
<script type="text/plain" id="lib-claude">{claude_sdk}</script>
<script type="text/plain" id="lib-tf">{tfjs}</script>
<script>{app}</script>
</body>
</html>
'''


def main():
    css = theme_css((ROOT / 'css' / 'styles.css').read_text())
    zxing = (JS / 'vendor' / 'zxing.min.js').read_text()
    claude_sdk = (JS / 'vendor' / 'anthropic-sdk.min.js').read_text()  # official Anthropic SDK (browser bundle)
    tfjs = (JS / 'vendor' / 'tf.min.js').read_text()  # TensorFlow.js for on-device Scan & teach
    icon = data_uri(ROOT / 'icons' / 'apple-touch-icon.png', 'image/png')
    favicon = data_uri(ROOT / 'icons' / 'icon.svg', 'image/svg+xml')
    body = ('<div id="app" aria-live="polite"></div>\n<nav id="tabs" class="tabs" hidden></nav>\n'
            '<div id="toast" class="toast" role="status" hidden></div>\n')
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)

    # 1) Downloadable offline app (data from the repo's data server)
    full = page(css, zxing, claude_sdk, tfjs, bundle(hosted=False), favicon, icon, body,
                'https://world.openfoodfacts.org https://api.nal.usda.gov https://raw.githubusercontent.com https://api.github.com https://api.anthropic.com')
    (out / 'PocketStats.html').write_text(full)

    # 1b) Android app: all data built in, no repo address, no GitHub at all
    assets = ROOT / 'android' / 'app' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    version = bundle_data(assets / 'data')
    apk_page = page(css, zxing, claude_sdk, tfjs, bundle(hosted=False, local_data=version), favicon, icon, body,
                    "'self' https://world.openfoodfacts.org https://api.nal.usda.gov https://api.anthropic.com")
    (assets / 'index.html').write_text(apk_page)
    leaks = [str(f.relative_to(assets)) for f in assets.rglob('*') if f.is_file() and b'jebyou' in f.read_bytes()]
    if leaks:
        raise SystemExit(f'Repo owner name found in Android assets: {leaks[:5]}')
    size = sum(f.stat().st_size for f in assets.rglob('*') if f.is_file())
    print(f'android assets: {size / 1e6:.1f} MB (data version {version}), no repo address inside')

    # 2) claude.ai web-link version (the host supplies the document skeleton and CSP)
    web = f'''<title>Pocket Stats</title>
<style>{css}</style>
{body}<script type="text/plain" id="lib-zxing">{zxing}</script>
<script type="text/plain" id="lib-tf">{tfjs}</script>
<script>{bundle(hosted=True)}</script>
'''
    (out / 'pocket-stats-web.html').write_text(web)
    for f in ('PocketStats.html', 'pocket-stats-web.html'):
        print(f'dist/{f}: {(out / f).stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
