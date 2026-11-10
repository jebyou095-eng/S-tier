// Built-in offline food table. Values are per 100 g, from USDA FoodData Central
// (SR Legacy / Foundation) reference data, rounded. Searching this table never
// touches the network.
//
// [id, name, kcal, protein g, carbs g, fat g, fiber g, serving g, serving label, tags]
// tags: p = good protein source, v = vegetarian, g = vegan
const RAW = [
  // Protein
  ['chicken-breast', 'Chicken breast, cooked, skinless', 165, 31.0, 0, 3.6, 0, 120, '1 piece', 'p'],
  ['chicken-thigh', 'Chicken thigh, cooked, skinless', 209, 25.9, 0, 10.9, 0, 100, '1 thigh', 'p'],
  ['turkey-breast', 'Turkey breast, roasted', 135, 30.1, 0, 0.7, 0, 100, '1 portion', 'p'],
  ['beef-90', 'Ground beef 90% lean, cooked', 217, 26.1, 0, 11.7, 0, 100, '1 portion', 'p'],
  ['beef-80', 'Ground beef 80% lean, cooked', 254, 25.8, 0, 16.6, 0, 100, '1 portion', 'p'],
  ['steak', 'Beef sirloin steak, cooked', 206, 29.0, 0, 9.0, 0, 170, '1 steak', 'p'],
  ['pork-tenderloin', 'Pork tenderloin, cooked', 143, 26.2, 0, 3.5, 0, 120, '1 portion', 'p'],
  ['salmon', 'Salmon (Atlantic), cooked', 206, 22.1, 0, 12.4, 0, 150, '1 fillet', 'p'],
  ['tuna-can', 'Tuna, canned in water, drained', 116, 25.5, 0, 0.8, 0, 120, '1 can', 'p'],
  ['cod', 'Cod, cooked', 105, 22.8, 0, 0.9, 0, 150, '1 fillet', 'p'],
  ['shrimp', 'Shrimp, cooked', 99, 24.0, 0.2, 0.3, 0, 100, '1 portion', 'p'],
  ['egg', 'Egg, whole', 143, 12.6, 0.7, 9.5, 0, 50, '1 large egg', 'pv'],
  ['egg-white', 'Egg white', 52, 10.9, 0.7, 0.2, 0, 33, '1 large white', 'pv'],
  ['whey', 'Whey protein powder (typical)', 380, 78, 8, 5, 0, 30, '1 scoop', 'pv'],
  ['greek-yogurt-0', 'Greek yogurt, plain, nonfat', 59, 10.2, 3.6, 0.4, 0, 170, '1 pot', 'pv'],
  ['greek-yogurt-full', 'Greek yogurt, plain, whole milk', 97, 9.0, 4.0, 5.0, 0, 170, '1 pot', 'pv'],
  ['cottage', 'Cottage cheese, 2%', 81, 10.5, 4.8, 2.3, 0, 113, '½ cup', 'pv'],
  ['tofu', 'Tofu, firm', 144, 17.3, 2.8, 8.7, 2.3, 125, '½ block', 'pvg'],
  ['tempeh', 'Tempeh', 192, 20.3, 7.6, 10.8, 0, 100, '1 portion', 'pvg'],
  ['edamame', 'Edamame, cooked', 121, 11.9, 8.9, 5.2, 5.2, 155, '1 cup', 'pvg'],
  ['lentils', 'Lentils, cooked', 116, 9.0, 20.1, 0.4, 7.9, 200, '1 cup', 'pvg'],
  ['black-beans', 'Black beans, cooked', 132, 8.9, 23.7, 0.5, 8.7, 172, '1 cup', 'pvg'],
  ['chickpeas', 'Chickpeas, cooked', 164, 8.9, 27.4, 2.6, 7.6, 164, '1 cup', 'pvg'],
  // Dairy
  ['milk-whole', 'Milk, whole', 61, 3.2, 4.8, 3.3, 0, 244, '1 cup', 'v'],
  ['milk-2', 'Milk, 2%', 50, 3.3, 4.8, 2.0, 0, 244, '1 cup', 'v'],
  ['milk-skim', 'Milk, skim', 34, 3.4, 5.0, 0.1, 0, 244, '1 cup', 'v'],
  ['cheddar', 'Cheddar cheese', 403, 24.9, 1.3, 33.1, 0, 28, '1 slice', 'v'],
  ['mozzarella', 'Mozzarella, part-skim', 254, 24.3, 2.8, 15.9, 0, 28, '1 oz', 'v'],
  // Carbs
  ['oats', 'Oats, rolled, dry', 379, 13.2, 67.7, 6.5, 10.1, 80, '1 cup dry', 'vg'],
  ['rice-white', 'White rice, cooked', 130, 2.7, 28.2, 0.3, 0.4, 158, '1 cup', 'vg'],
  ['rice-brown', 'Brown rice, cooked', 112, 2.3, 23.5, 0.8, 1.8, 195, '1 cup', 'vg'],
  ['pasta', 'Pasta, cooked', 158, 5.8, 30.9, 0.9, 1.8, 140, '1 cup', 'vg'],
  ['quinoa', 'Quinoa, cooked', 120, 4.4, 21.3, 1.9, 2.8, 185, '1 cup', 'vg'],
  ['bread-ww', 'Whole-wheat bread', 252, 12.4, 42.7, 3.5, 6.0, 32, '1 slice', 'vg'],
  ['bread-white', 'White bread', 266, 7.6, 50.6, 3.3, 2.4, 28, '1 slice', 'vg'],
  ['tortilla-corn', 'Corn tortilla', 218, 5.7, 44.6, 2.9, 6.3, 26, '1 tortilla', 'vg'],
  ['potato', 'Potato, baked, with skin', 93, 2.5, 21.2, 0.1, 2.2, 173, '1 medium', 'vg'],
  ['sweet-potato', 'Sweet potato, baked', 90, 2.0, 20.7, 0.2, 3.3, 114, '1 medium', 'vg'],
  ['cornflakes', 'Corn flakes cereal', 357, 7.5, 84.1, 0.4, 3.3, 28, '1 cup', 'vg'],
  // Fruit
  ['banana', 'Banana', 89, 1.1, 22.8, 0.3, 2.6, 118, '1 medium', 'vg'],
  ['apple', 'Apple', 52, 0.3, 13.8, 0.2, 2.4, 182, '1 medium', 'vg'],
  ['orange', 'Orange', 47, 0.9, 11.8, 0.1, 2.4, 131, '1 medium', 'vg'],
  ['blueberries', 'Blueberries', 57, 0.7, 14.5, 0.3, 2.4, 148, '1 cup', 'vg'],
  ['strawberries', 'Strawberries', 32, 0.7, 7.7, 0.3, 2.0, 152, '1 cup', 'vg'],
  ['grapes', 'Grapes', 69, 0.7, 18.1, 0.2, 0.9, 151, '1 cup', 'vg'],
  ['mango', 'Mango', 60, 0.8, 15.0, 0.4, 1.6, 165, '1 cup', 'vg'],
  ['raisins', 'Raisins', 299, 3.1, 79.2, 0.5, 3.7, 40, 'small box', 'vg'],
  ['dates', 'Dates, Medjool', 277, 1.8, 75.0, 0.2, 6.7, 24, '1 date', 'vg'],
  ['avocado', 'Avocado', 160, 2.0, 8.5, 14.7, 6.7, 100, '½ avocado', 'vg'],
  // Vegetables
  ['broccoli', 'Broccoli, cooked', 35, 2.4, 7.2, 0.4, 3.3, 156, '1 cup', 'vg'],
  ['spinach', 'Spinach, raw', 23, 2.9, 3.6, 0.4, 2.2, 30, '1 cup', 'vg'],
  ['carrot', 'Carrot, raw', 41, 0.9, 9.6, 0.2, 2.8, 61, '1 medium', 'vg'],
  ['lettuce', 'Lettuce, green leaf', 15, 1.4, 2.9, 0.2, 1.3, 36, '1 cup', 'vg'],
  ['tomato', 'Tomato', 18, 0.9, 3.9, 0.2, 1.2, 123, '1 medium', 'vg'],
  ['pepper', 'Bell pepper, red', 31, 1.0, 6.0, 0.3, 2.1, 119, '1 medium', 'vg'],
  ['green-beans', 'Green beans, cooked', 35, 1.9, 7.9, 0.3, 3.2, 125, '1 cup', 'vg'],
  ['peas', 'Green peas, cooked', 78, 5.2, 14.3, 0.3, 4.5, 160, '1 cup', 'vg'],
  ['corn', 'Sweet corn, cooked', 96, 3.4, 21.0, 1.5, 2.4, 145, '1 cup', 'vg'],
  // Fats, nuts, extras
  ['olive-oil', 'Olive oil', 884, 0, 0, 100, 0, 14, '1 tbsp', 'vg'],
  ['butter', 'Butter', 717, 0.9, 0.1, 81.1, 0, 14, '1 tbsp', 'v'],
  ['peanut-butter', 'Peanut butter', 588, 25.1, 20.0, 50.4, 6.0, 32, '2 tbsp', 'vg'],
  ['almonds', 'Almonds', 579, 21.2, 21.6, 49.9, 12.5, 28, '1 handful', 'vg'],
  ['walnuts', 'Walnuts', 654, 15.2, 13.7, 65.2, 6.7, 28, '1 handful', 'vg'],
  ['peanuts', 'Peanuts', 567, 25.8, 16.1, 49.2, 8.5, 28, '1 handful', 'vg'],
  ['cashews', 'Cashews', 553, 18.2, 30.2, 43.9, 3.3, 28, '1 handful', 'vg'],
  ['chia', 'Chia seeds', 486, 16.5, 42.1, 30.7, 34.4, 12, '1 tbsp', 'vg'],
  ['hummus', 'Hummus', 166, 7.9, 14.3, 9.6, 6.0, 60, '¼ cup', 'vg'],
  ['dark-chocolate', 'Dark chocolate 70–85%', 598, 7.8, 45.9, 42.6, 10.9, 20, '2 squares', 'vg'],
  ['honey', 'Honey', 304, 0.3, 82.4, 0, 0.2, 21, '1 tbsp', 'v'],
  // Moroccan staples: USDA values where an equivalent exists
  ['couscous', 'Couscous, cooked (kesksou)', 112, 3.8, 23.2, 0.2, 1.4, 160, '1 cup', 'vg'],
  ['sardines', 'Sardines in oil, drained (sardine)', 208, 24.6, 0, 11.5, 0, 90, '1 can', 'p'],
  ['fava', 'Fava beans, cooked (foul)', 110, 7.6, 19.7, 0.4, 5.4, 170, '1 cup', 'pvg'],
  ['olives-green', 'Olives, green (zitoun)', 145, 1.0, 3.8, 15.3, 3.3, 30, '8 olives', 'vg'],
  ['olives-black', 'Olives, black (zitoun)', 115, 0.8, 6.3, 10.7, 3.2, 30, '8 olives', 'vg'],
  // Moroccan home dishes: typical-recipe ESTIMATES (recipes vary a lot; weigh and adjust)
  ['khobz', 'Khobz (Moroccan round bread)', 255, 8.5, 51, 1.5, 2.5, 100, '¼ loaf', 'vg', 'Estimate'],
  ['msemen', 'Msemen / rghaif', 330, 7, 45, 13, 2, 80, '1 piece', 'v', 'Estimate'],
  ['harcha', 'Harcha (semolina flatbread)', 380, 7, 52, 16, 2.5, 70, '1 piece', 'v', 'Estimate'],
  ['baghrir', 'Baghrir (1000-hole pancake)', 190, 5.5, 38, 1.5, 1.5, 60, '1 piece', 'v', 'Estimate'],
  ['harira', 'Harira (soup)', 60, 3.2, 9, 1.3, 2, 300, '1 bowl', '', 'Estimate'],
  ['bissara', 'Bissara (fava bean soup)', 95, 5.5, 13, 2.5, 4, 300, '1 bowl', 'vg', 'Estimate'],
  ['tagine-chicken', 'Chicken tagine with vegetables', 120, 11, 6, 6, 1.5, 350, '1 plate', 'p', 'Estimate'],
  ['tagine-meat', 'Beef or lamb tagine', 150, 12, 6, 9, 1.5, 350, '1 plate', 'p', 'Estimate'],
  ['kefta', 'Kefta, grilled (minced meat)', 250, 20, 2, 18, 0, 100, '4 skewers', 'p', 'Estimate'],
  ['lben', 'Lben (fermented milk)', 45, 3.3, 4.5, 1.5, 0, 250, '1 glass', 'v', 'Estimate'],
  ['jben', 'Jben (fresh cheese)', 160, 11, 3, 11.5, 0, 50, '1 piece', 'pv', 'Estimate'],
  ['amlou', 'Amlou (almond, argan oil, honey)', 600, 17, 20, 52, 6, 20, '1 tbsp', 'v', 'Estimate'],
  ['chebakia', 'Chebakia', 470, 6, 60, 23, 2, 30, '1 piece', 'v', 'Estimate'],
  ['atay', 'Mint tea with sugar (atay)', 40, 0, 10, 0, 0, 120, '1 glass', 'vg', 'Estimate'],
];

export const FOODS = RAW.map(([id, name, kcal, p, c, f, fib, serving, servingLabel, tags, source = 'USDA']) => ({
  id, name, source, n: { kcal, p, c, f, fib }, serving, servingLabel, tags,
}));

export const FOOD_BY_ID = Object.fromEntries(FOODS.map((x) => [x.id, x]));

/** Simple ranked substring search over the built-in table. */
export function searchLocal(q, extra = []) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return [...extra, ...FOODS]
    .map((f) => {
      const hay = f.hay || `${f.name} ${f.brand || ''} ${f.alt || ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      return { f, score: (hay.startsWith(words[0]) ? 0 : 1) + hay.length / 100 };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.f);
}

// Sample-day templates. Items marked p:true are scaled to hit protein; the rest scale to hit calories.
export const PLANS = {
  omnivore: [
    ['Breakfast', [['oats', 80], ['milk-2', 250], ['whey', 30, true], ['banana', 118]]],
    ['Lunch', [['chicken-breast', 150, true], ['rice-white', 250], ['broccoli', 150], ['olive-oil', 10]]],
    ['Snack', [['greek-yogurt-0', 200, true], ['blueberries', 100], ['almonds', 30]]],
    ['Dinner', [['salmon', 150, true], ['potato', 300], ['green-beans', 125], ['olive-oil', 10]]],
  ],
  vegetarian: [
    ['Breakfast', [['oats', 80], ['milk-2', 250], ['whey', 30, true], ['banana', 118], ['peanut-butter', 16]]],
    ['Lunch', [['tofu', 200, true], ['quinoa', 250], ['broccoli', 150], ['olive-oil', 10]]],
    ['Snack', [['greek-yogurt-0', 250, true], ['blueberries', 100], ['walnuts', 25]]],
    ['Dinner', [['lentils', 250, true], ['egg', 100, true], ['rice-brown', 200], ['spinach', 60], ['olive-oil', 10]]],
  ],
};
