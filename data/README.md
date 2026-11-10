# Pocket Stats food data

The app downloads `foods-morocco.json` from this folder (about once a week) and searches it offline.
Product photos in `img/` load only when shown, then stay cached on the phone.
Nothing personal is ever sent: GitHub only sees that the public list or a photo was requested.

## What's in it

| Where sold | Source | Values |
|---|---|---|
| **Supermarket** (Marjane, Carrefour, BIM, Aswak Assalam, épiceries) | [Open Food Facts](https://world.openfoodfacts.org/country/morocco): products tagged as sold in Morocco | Copied from the nutrition label by contributors. Products whose calories don't match their protein/carbs/fat are left out. |
| **Souk / market** (fruit, vegetables, legumes, nuts, olives, meat, fish, dairy) | `sources/market_foods.py` | USDA FoodData Central reference values |
| **Street food, café, bakery, home cooking** (msemen, harira, bocadillo, tagine…) | `sources/recipes.py` | **Calculated** from a typical family recipe (ingredient grams + cooked weight) using USDA values for each ingredient. In the app you can remove or change any ingredient. Recipes vary, so weigh your portion. |

## Updating

```sh
# 1. Extract Moroccan products from the Open Food Facts export (see tools/build_food_db.py)
# 2. Rebuild the list (and thumbnails, if you pass --images)
python3 tools/build_food_db.py --off morocco.jsonl --images images.tsv
```

To add a photo for a market or street food, put a square JPEG (about 160×160) at
`img/market/<id>.jpg`, using the id from `sources/market_foods.py` (for example `img/market/harira.jpg`),
then rebuild.

## Licences

- Open Food Facts data: [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
  Product photos: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), © Open Food Facts contributors.
- USDA FoodData Central: public domain.
