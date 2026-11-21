#!/usr/bin/env python3
"""Update data/foods-morocco.json's ingredient table in place (Arabic names + new ingredients)
without re-downloading the Open Food Facts exports that tools/build_food_db.py needs."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'data' / 'sources'))
from recipes import INGREDIENTS, INGREDIENTS_AR  # noqa: E402

p = ROOT / 'data' / 'foods-morocco.json'
db = json.loads(p.read_text())
db['ingredients'] = {i: list(v) + [INGREDIENTS_AR.get(i, '')] for i, v in INGREDIENTS.items()}
missing = [i for i in INGREDIENTS if not INGREDIENTS_AR.get(i)]
assert not missing, missing
p.write_text(json.dumps(db, ensure_ascii=False, separators=(',', ':')))
print(f'{len(INGREDIENTS)} ingredients, all with Arabic names')
