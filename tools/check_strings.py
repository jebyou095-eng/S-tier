#!/usr/bin/env python3
"""List translation keys used in js/*.js that are missing from lang-en.js / lang-ar.js."""
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
def keys(f):
    s = (ROOT / 'js' / f).read_text()
    return set(re.findall(r'^\s*"([^"]+)":', s, re.M))
en, ar = keys('lang-en.js'), keys('lang-ar.js')
used = set(); dyn = set()
for p in (ROOT / 'js').glob('*.js'):
    if p.name.startswith('lang-'): continue
    s = p.read_text()
    used |= set(re.findall(r"\bt\('([\w.\-]+)'", s))
    for k in re.findall(r"\btn\('([\w.\-]+)'", s): used.add(k + '.other')
    dyn |= set(re.findall(r"\bt\(`([^`]+)`", s))
miss_en = sorted(k for k in used if k not in en)
miss_ar = sorted(k for k in used if k not in ar)
print('used', len(used), 'missing EN', len(miss_en), 'missing AR', len(miss_ar))
if '-v' in sys.argv:
    print('\n'.join(miss_en)); print('--- dynamic:'); print('\n'.join(sorted(dyn)))
