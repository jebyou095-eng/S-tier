#!/usr/bin/env python3
"""Build data/foods-morocco.json (and product thumbnails) for the app.

Inputs
  --off morocco.jsonl      Moroccan rows extracted from the Open Food Facts CSV export
  --images images.tsv      code <tab> front image id (from the OFF JSONL export), optional
  data/sources/market_foods.py  hand-curated souk / street / home foods

The app downloads data/foods-morocco.json once from GitHub and searches it
offline. Thumbnails live in data/img/<first 3 digits>/<barcode>.jpg and load
only when a product is shown.
"""
import argparse
import io
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'data' / 'sources'))
from market_foods import FOODS as MARKET  # noqa: E402

CATEGORIES = [  # first match wins: (label, exact OFF category tags without the "en:" prefix)
    ('Water', ['waters', 'mineral-waters', 'spring-waters']),
    ('Dairy', ['dairies', 'yogurts', 'milks', 'cheeses', 'fermented-milk-products', 'butters', 'creams', 'dairy-desserts']),
    ('Biscuits & cakes', ['biscuits-and-cakes', 'biscuits', 'cakes', 'wafers', 'pastries', 'viennoiseries']),
    ('Chocolate & sweets', ['chocolates', 'confectioneries', 'candies', 'sweet-spreads', 'jams', 'honeys', 'sugars', 'sweeteners', 'ice-creams']),
    ('Chips & snacks', ['salty-snacks', 'crisps', 'chips-and-fries', 'nuts', 'appetizers', 'popcorn']),
    ('Drinks', ['beverages', 'juices', 'fruit-juices', 'sodas', 'carbonated-drinks', 'teas', 'coffees', 'energy-drinks', 'syrups']),
    ('Bread & cereals', ['breads', 'breakfast-cereals', 'pastas', 'rices', 'flours', 'semolinas', 'couscous', 'cereal-grains']),
    ('Oils & fats', ['fats', 'vegetable-oils', 'olive-oils', 'margarines']),
    ('Canned & ready meals', ['canned-foods', 'meals', 'soups', 'sauces', 'condiments', 'tomato-sauces', 'spices']),
    ('Meat & fish', ['meats', 'sausages', 'fishes', 'seafood', 'canned-fishes', 'poultries']),
    ('Fruit & vegetables', ['fruits', 'vegetables', 'legumes', 'olives', 'dates', 'dried-fruits']),
]
WHERE = {'supermarket': 'Supermarket', 'souk': 'Souk / market', 'street': 'Street food', 'cafe': 'Café', 'bakery': 'Bakery', 'home': 'Home cooking'}


def num(v):
    try:
        x = float(v)
        return x if x == x and x >= 0 else None
    except (TypeError, ValueError):
        return None


def category(tags):
    have = {t.strip()[3:] for t in tags.lower().split(',') if t.strip().startswith('en:')}
    for label, keys in CATEGORIES:
        if have.intersection(keys):
            return label
    return 'Other groceries'


def clean_off(row):
    kcal = num(row.get('energy-kcal_100g'))
    kj = num(row.get('energy_100g'))
    if kcal is None and kj is not None:
        kcal = kj / 4.184
    p, c, f = num(row.get('proteins_100g')), num(row.get('carbohydrates_100g')), num(row.get('fat_100g'))
    fib = num(row.get('fiber_100g')) or 0
    name = re.sub(r'\s+', ' ', (row.get('product_name') or row.get('generic_name') or '')).strip()
    code = re.sub(r'\D', '', row.get('code') or '')
    if None in (kcal, p, c, f) or not name or len(code) < 8:
        return None
    if kcal > 900 or p > 100 or c > 100 or f > 100 or p + c + f > 105:
        return None
    est = 4 * p + 4 * c + 9 * f + 2 * fib
    if kcal > 15 and est > 0 and not (0.75 <= kcal / est <= 1.25):
        return None  # label values don't add up: likely a data-entry error
    serving = num(row.get('serving_quantity'))
    sl = (row.get('serving_size') or '').strip()[:30]
    item = {
        'id': f'off:{code}', 'code': code, 'n': name[:80], 'b': (row.get('brands') or '').split(',')[0].strip()[:40],
        'w': 'supermarket', 'cat': category(row.get('categories_tags') or ''),
        'k': round(kcal), 'p': round(p, 1), 'c': round(c, 1), 'f': round(f, 1), 'fi': round(fib, 1),
        's': round(serving) if serving and 1 <= serving <= 2000 else 100, 'sl': sl if serving else '100 g',
        'src': 'Open Food Facts', 'q': (row.get('quantity') or '').strip()[:20],
    }
    if row.get('nutriscore_grade') in list('abcde'):
        item['ns'] = row['nutriscore_grade']
    return item


def market_items():
    for (id_, en, fr, ar, where, cat, k, p, c, f, fi, s, sl, src, icon) in MARKET:
        item = {'id': f'ma:{id_}', 'n': en, 'fr': fr, 'ar': ar, 'w': where, 'cat': cat,
                'k': k, 'p': p, 'c': c, 'f': f, 'fi': fi, 's': s, 'sl': sl, 'src': src, 'e': icon}
        if (ROOT / 'data' / 'img' / 'market' / f'{id_}.jpg').exists():  # add your own photo here
            item['img'] = f'img/market/{id_}.jpg'
        yield item


def image_url(code, imgid):
    path = code if len(code) <= 8 else re.sub(r'^(...)(...)(...)(.*)$', r'\1/\2/\3/\4', code.zfill(13))
    return f'https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/{path}/{imgid}.400.jpg'


def fetch_thumb(code, imgid, dest, size=160):
    from PIL import Image
    if dest.exists():
        return True
    for attempt in range(3):
        try:
            with urllib.request.urlopen(image_url(code, imgid), timeout=30) as r:
                img = Image.open(io.BytesIO(r.read())).convert('RGB')
            img.thumbnail((size, size))
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, 'JPEG', quality=70, optimize=True, progressive=True)
            return True
        except Exception:  # noqa: BLE001 - network hiccups; retry then give up
            time.sleep(1 + attempt)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--off', required=True)
    ap.add_argument('--images')
    ap.add_argument('--no-thumbs', action='store_true')
    a = ap.parse_args()

    products = {}
    for line in open(a.off, encoding='utf-8'):
        item = clean_off(json.loads(line))
        if item:
            products[item['code']] = item  # later rows win (CSV is one row per product anyway)
    print(f'Open Food Facts: {len(products)} Moroccan products with consistent nutrition', file=sys.stderr)

    if a.images:
        imgs = dict(l.rstrip('\n').split('\t') for l in open(a.images) if '\t' in l)
        todo = [(c, imgs[c]) for c in products if c in imgs]
        print(f'Thumbnails to fetch: {len(todo)}', file=sys.stderr)
        img_dir = ROOT / 'data' / 'img'
        done = 0
        if not a.no_thumbs:
            with ThreadPoolExecutor(16) as ex:
                for (code, _), ok in zip(todo, ex.map(lambda t: fetch_thumb(t[0], t[1], img_dir / t[0][:3] / f'{t[0]}.jpg'), todo)):
                    if ok:
                        products[code]['img'] = f'img/{code[:3]}/{code}.jpg'
                        done += 1
        print(f'Thumbnails saved: {done}', file=sys.stderr)

    foods = list(market_items()) + sorted(products.values(), key=lambda x: (x['cat'], x['b'].lower(), x['n'].lower()))
    out = {
        'version': time.strftime('%Y-%m-%d'),
        'where': WHERE,
        'attribution': 'Packaged products and photos: Open Food Facts contributors (ODbL / CC BY-SA). '
                       'Market foods: USDA FoodData Central values or labelled recipe estimates.',
        'foods': foods,
    }
    dest = ROOT / 'data' / 'foods-morocco.json'
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(f'Wrote {dest.relative_to(ROOT)}: {len(foods)} foods, {dest.stat().st_size / 1024:.0f} KB', file=sys.stderr)


if __name__ == '__main__':
    main()
