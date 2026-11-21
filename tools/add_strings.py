#!/usr/bin/env python3
"""Append a section of strings to js/lang-en.js and js/lang-ar.js.
Usage: python3 tools/add_strings.py section.py   (defines SECTION = 'name', EN = {...}, AR = {...})"""
import json, runpy, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
d = runpy.run_path(sys.argv[1])
en, ar, name = d['EN'], d['AR'], d['SECTION']
missing = [k for k in en if k not in ar]
extra = [k for k in ar if k not in en and not (k.rsplit('.', 1)[-1] in ('zero', 'two', 'few', 'many') and k.rsplit('.', 1)[0] + '.other' in en)]
if missing or extra:
    sys.exit(f'{name}: missing in AR {missing[:10]} / extra {extra[:10]}')
for fname, table in (('lang-en.js', en), ('lang-ar.js', ar)):
    p = ROOT / 'js' / fname
    s = p.read_text()
    marker = f'  // ---- {name} ----\n'
    if marker in s:  # replace the section
        start = s.index(marker); end = s.find('  // ---- ', start + len(marker))
        end = end if end != -1 else s.rindex('};')
        s = s[:start] + s[end:]
    body = marker + ''.join(f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in table.items())
    i = s.rindex('};')
    s = s[:i] + body + s[i:]
    p.write_text(s)
print(f'{name}: {len(en)} strings')
