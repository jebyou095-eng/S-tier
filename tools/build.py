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


def bundle(hosted):
    order = []
    load(ENTRY.removesuffix('.js'), set(), order)
    code = '"use strict";\nglobalThis.POCKET_STATS_BUNDLED = true;\n'
    if hosted:
        code += 'globalThis.POCKET_STATS_HOSTED = true;\n'
    code += ''.join(convert(n, s) for n, s in order)
    return code


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


def main():
    css = theme_css((ROOT / 'css' / 'styles.css').read_text())
    zxing = (JS / 'vendor' / 'zxing.min.js').read_text()
    icon = data_uri(ROOT / 'icons' / 'apple-touch-icon.png', 'image/png')
    favicon = data_uri(ROOT / 'icons' / 'icon.svg', 'image/svg+xml')
    body = ('<div id="app" aria-live="polite"></div>\n<nav id="tabs" class="tabs" hidden></nav>\n'
            '<div id="toast" class="toast" role="status" hidden></div>\n')
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)

    # 1) Downloadable offline app
    app = bundle(hosted=False)
    csp = ("default-src 'none'; "
           f"script-src {sha(zxing)} {sha(app)}; style-src {sha(css)}; "
           "img-src data: blob:; media-src blob: mediastream:; "
           "connect-src https://world.openfoodfacts.org https://api.nal.usda.gov; base-uri 'none'; form-action 'none'")
    full = f'''<!doctype html>
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
{body}<script>{zxing}</script>
<script>{app}</script>
</body>
</html>
'''
    (out / 'PocketStats.html').write_text(full)
    assets = ROOT / 'android' / 'app' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    (assets / 'index.html').write_text(full)

    # 2) claude.ai web-link version (the host supplies the document skeleton and CSP)
    web = f'''<title>Pocket Stats</title>
<style>{css}</style>
{body}<script>{zxing}</script>
<script>{bundle(hosted=True)}</script>
'''
    (out / 'pocket-stats-web.html').write_text(web)
    for f in ('PocketStats.html', 'pocket-stats-web.html'):
        print(f'dist/{f}: {(out / f).stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
