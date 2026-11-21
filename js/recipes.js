// Recipe library: the dishes in your meal plan, in English and Arabic, with cooking steps.
// Nutrition is NOT written here: it is calculated from the app's food database
// (USDA and Moroccan values per 100 g) from the ingredient amounts below.
//
// Ingredient: [database id, grams, options]
//   options: n = how many (eggs, dates…), u = 'ml' for liquids, en/ar = a more precise label
//   (e.g. "Cumin" for the spices entry), carb = the carb portion the plan resizes by day type,
//   side = served with it, opt = optional. An id starting with @ is a portion of another
//   recipe (grams = how many of its servings), e.g. one piece of the brownie tray.
// Slots: breakfast, shake, lunch, snack, pregym, dinner, drink.

const I = (id, g, o = {}) => [id, g, o];
const TSP_OIL = 4.5; const TBSP_OIL = 13.5;
const SPICE = (en, ar, g = 1) => I('spices', g, { en, ar });
const SALT = I('salt', 1, { en: 'Salt', ar: 'الملحة', pinch: true });

function R(id, slot, name, ar, meta, ing, en, arSteps) {
  return { id, slot, name, ar, min: 20, tags: [], batch: false, eggs: 0, serves: 1, ...meta, ing, steps: { en, ar: arSteps } };
}

export const RECIPES = [
  // ---------------- Breakfasts ----------------
  R('pancakes', 'breakfast', 'Pancakes', 'بانكيك', { min: 20, eggs: 1, tags: ['legs-plus'] }, [
    I('flour', 80), I('egg', 50, { n: 1 }), I('milk', 150, { u: 'ml' }), I('baking-powder', 4, { en: 'Baking powder (cake type)', ar: 'الخميرة الكيميائية (ديال الكيك)', qty: '1 tsp' }),
    SALT, I('veg-oil', TSP_OIL + 3, { qty: '1 tsp + a little for the pan' }), I('banana', 118, { n: 1, side: true }), I('dates', 24, { n: 3, side: true }),
  ], [
    'Mix the flour, baking powder and salt in a bowl.',
    'Beat the egg with the milk and oil in another bowl.',
    'Pour the wet mix into the dry and stir until smooth; small lumps are fine.',
    'Rest 2 min while a pan heats on medium. Wipe it with oil.',
    'Pour ⅓ of the batter. Flip when bubbles appear (about 2 min), then cook 1 min more.',
    'Repeat twice. Serve with 1 banana and 3 dates.',
  ], [
    'خلط الفرينة والخميرة الكيميائية والملحة فزلافة.',
    'خبط البيضة مع الحليب والزيت فزلافة أخرى.',
    'زيد الخليط السائل على الفرينة وحرك حتى يولي مزيان؛ شي كويرات صغار ماشي مشكل.',
    'خليه يرتاح دقيقتين وسخن المقلة على نار متوسطة. مسحها بشوية ديال الزيت.',
    'كب ⅓ ديال العجينة. قلبها ملي يبانو الفقاعات (تقريبا دقيقتين)، وطيبها دقيقة أخرى.',
    'عاود جوج مرات. قدمها مع بنانة و3 تمرات.',
  ]),
  R('banana-pancakes', 'breakfast', 'Banana pancakes', 'بانكيك بالبنان', { min: 20, eggs: 1 }, [
    I('flour', 80), I('egg', 50, { n: 1 }), I('milk', 150, { u: 'ml' }), I('baking-powder', 4, { qty: '1 tsp' }), SALT,
    I('veg-oil', TSP_OIL + 3, { qty: '1 tsp + a little for the pan' }), I('banana', 118, { n: 1, en: 'Banana, mashed', ar: 'بنانة مهروسة' }), I('dates', 24, { n: 3, side: true }),
  ], [
    'Mash the banana and stir it into the beaten egg, milk and oil.',
    'Mix the flour, baking powder and salt, then pour in the wet mix and stir until smooth.',
    'Cook ⅓ of the batter at a time in a lightly oiled pan on medium heat: flip when bubbles appear, then 1 min more.',
    'Serve with 3 dates.',
  ], [
    'هرس البنانة وزيدها على البيضة المخبوطة مع الحليب والزيت.',
    'خلط الفرينة والخميرة الكيميائية والملحة، من بعد زيد الخليط السائل وحرك حتى يولي مزيان.',
    'طيب ⅓ ديال العجينة كل مرة فمقلة فيها شوية زيت على نار متوسطة: قلبها ملي يبانو الفقاعات، ومن بعد دقيقة أخرى.',
    'قدمها مع 3 تمرات.',
  ]),
  R('eggs-tomato', 'breakfast', 'Eggs with tomato', 'بيض بمطيشة', { min: 12, eggs: 2 }, [
    I('egg', 100, { n: 2 }), I('tomato', 240, { n: 2 }), I('veg-oil', TSP_OIL, { qty: '1 tsp' }), SPICE('Cumin', 'الكامون'), SALT,
    I('bread-ww', 60, { en: '½ whole-wheat khobz', ar: '½ خبز الفارينة الكاملة', side: true }),
  ], [
    'Grate the tomatoes.',
    'Cook them in the oil with cumin and salt for 5 min.',
    'Crack the eggs on top, cover and cook 3–4 min. Eat with the bread.',
  ], [
    'حك مطيشة.',
    'طيبها فالزيت مع الكامون والملحة 5 دقايق.',
    'هرس البيض فوقها، غطيها وخليها 3 حتى 4 دقايق. كولها مع الخبز.',
  ]),
  R('omelette', 'breakfast', 'Omelette', 'أومليط', { min: 10, eggs: 2 }, [
    I('egg', 100, { n: 2 }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('tomato', 60, { en: 'Tomato (½)', ar: 'نص مطيشة' }), I('herbs', 5, { en: 'Parsley', ar: 'المعدنوس' }),
    I('veg-oil', TSP_OIL, { qty: '1 tsp' }), SALT, I('bread-ww', 60, { en: '½ whole-wheat khobz', ar: '½ خبز الفارينة الكاملة', side: true }),
  ], [
    'Chop the vegetables and beat them with the eggs and salt.',
    'Cook in the oil for 2–3 min, then fold.',
  ], [
    'قطع الخضرة صغار وخبطها مع البيض والملحة.',
    'طيبها فالزيت 2 حتى 3 دقايق، ومن بعد طويها.',
  ]),
  R('msemen', 'breakfast', 'Msemen (3 pieces)', 'مسمن (3 حبات)', { min: 30 }, [
    I('flour', 120), I('water', 70, { u: 'ml', en: 'Warm water', ar: 'ما سخون' }), SALT, I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }),
    I('peanuts', 20, { side: true }), I('dates', 24, { n: 3, side: true }),
  ], [
    'Knead the flour, salt and water for 5 min.',
    'Rest 10 min, then make 3 balls.',
    'Oil your hands, press each ball very thin and fold it into a square.',
    'Cook in a little oil, 2–3 min per side.',
    'Serve with 20 g peanuts and 3 dates.',
  ], [
    'عجن الفرينة والملحة والما 5 دقايق.',
    'خليها ترتاح 10 دقايق، ومن بعد دير 3 كويرات.',
    'دهن يديك بالزيت، فرد كل كورة رقيقة بزاف وطويها مربعة.',
    'طيبها فشوية ديال الزيت، 2 حتى 3 دقايق على كل جهة.',
    'قدمها مع 20 غ ديال الكاوكاو و3 تمرات.',
  ]),
  R('harcha', 'breakfast', 'Harcha (2 pieces)', 'حرشة (2 حبات)', { min: 25 }, [
    I('semolina', 100), I('milk', 70, { u: 'ml' }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }), I('baking-powder', 2, { qty: '½ tsp' }), SALT,
  ], [
    'Mix everything into a soft dough.',
    'Rest 5 min.',
    'Shape 2 discs 1 cm thick and dust them with semolina.',
    'Cook on low heat, 5 min per side.',
  ], [
    'خلط كلشي حتى تولي عجينة رطبة.',
    'خليها ترتاح 5 دقايق.',
    'دير جوج حبات غليظين 1 سنتيمتر وغبرهم بالسميدة.',
    'طيبهم على نار هادية، 5 دقايق على كل جهة.',
  ]),
  R('oat-porridge', 'breakfast', 'Oat porridge', 'عصيدة الشوفان', { min: 10 }, [
    I('oats', 60), I('milk', 250, { u: 'ml' }), I('banana', 118, { n: 1 }), I('peanuts', 15), I('dates', 16, { n: 2 }),
  ], [
    'Simmer the oats in the milk for 5 min, stirring.',
    'Top with the sliced banana, crushed peanuts and chopped dates.',
  ], [
    'طيب الشوفان فالحليب على نار هادية 5 دقايق وانت كتحرك.',
    'زيد فوقو البنان مقطع، والكاوكاو مهرس والتمر مقطع.',
  ]),
  R('khobz-jben-eggs', 'breakfast', 'Khobz with jben and eggs', 'خبز بالجبن والبيض', { min: 12, eggs: 2 }, [
    I('bread-ww', 60, { en: '½ whole-wheat khobz', ar: '½ خبز الفارينة الكاملة' }), I('jben', 50), I('egg', 100, { n: 2 }), I('olive-oil', TSP_OIL, { qty: '1 tsp' }),
  ], [
    'Boil the eggs for 10 min.',
    'Serve with the khobz, jben and a drizzle of olive oil.',
  ], [
    'سلق البيض 10 دقايق.',
    'قدمو مع الخبز والجبن وشوية ديال زيت الزيتون.',
  ]),

  // ---------------- Shakes and drinks ----------------
  R('shake', 'shake', 'Standard shake', 'الشيك', { min: 5 }, [
    I('milk', 300, { u: 'ml' }), I('oats', 60), I('banana', 118, { n: 1 }), I('peanuts', 30), I('dates', 24, { n: 3 }),
  ], [
    'Blend the oats and peanuts into a powder (20 s).',
    'Add the rest and blend 1 min.',
    'Bottle it and keep it in the fridge overnight. Shake before drinking.',
  ], [
    'طحن الشوفان والكاوكاو حتى يوليو غبرة (20 ثانية).',
    'زيد الباقي وطحن دقيقة.',
    'عمرو فقرعة وخليه فالتلاجة الليل كامل. خضو قبل ما تشربو.',
  ]),
  R('avocado-shake', 'shake', 'Avocado shake', 'شيك لافوكا', { min: 5 }, [
    I('milk', 300, { u: 'ml' }), I('oats', 60), I('banana', 118, { n: 1 }), I('avocado', 100, { en: 'Avocado (½)', ar: 'نص لافوكا' }),
    I('dates', 24, { n: 3 }), I('almonds', 12, { n: 10 }), I('walnuts', 15, { n: 3 }),
  ], [
    'Blend the oats and nuts into a powder first.',
    'Add everything else and blend 1 min.',
  ], [
    'طحن الشوفان واللوز والݣرݣاع حتى يوليو غبرة.',
    'زيد كلشي لاخر وطحن دقيقة.',
  ]),
  R('cocoa-shake', 'shake', 'Cocoa banana shake', 'شيك الكاكاو والبنان', { min: 5, variant: true }, [
    I('milk', 300, { u: 'ml' }), I('oats', 60), I('banana', 118, { n: 1 }), I('peanuts', 25), I('cocoa', 5, { qty: '1 tbsp' }), I('dates', 24, { n: 3 }),
  ], [
    'Blend the oats and peanuts into a powder.',
    'Add the milk, banana, cocoa and dates and blend 1 min.',
  ], [
    'طحن الشوفان والكاوكاو حتى يوليو غبرة.',
    'زيد الحليب والبنان والكاكاو والتمر وطحن دقيقة.',
  ]),
  R('almond-shake', 'shake', 'Almond date shake', 'شيك اللوز والتمر', { min: 5, variant: true }, [
    I('milk', 300, { u: 'ml' }), I('oats', 60), I('banana', 118, { n: 1 }), I('almonds', 25, { n: 20 }), I('dates', 32, { n: 4 }),
  ], [
    'Blend the oats and almonds into a powder.',
    'Add the rest and blend 1 min.',
  ], [
    'طحن الشوفان واللوز حتى يوليو غبرة.',
    'زيد الباقي وطحن دقيقة.',
  ]),
  R('raib-shake', 'shake', 'Raib oat shake', 'شيك الرايب والشوفان', { min: 5, variant: true }, [
    I('milk', 200, { u: 'ml' }), I('raib', 110, { n: 1 }), I('oats', 50), I('banana', 118, { n: 1 }), I('peanuts', 25), I('dates', 24, { n: 3 }),
  ], [
    'Blend the oats and peanuts into a powder.',
    'Add the milk, raib, banana and dates and blend 1 min.',
  ], [
    'طحن الشوفان والكاوكاو حتى يوليو غبرة.',
    'زيد الحليب والرايب والبنان والتمر وطحن دقيقة.',
  ]),
  R('walnut-shake', 'shake', 'Walnut banana shake', 'شيك الݣرݣاع والبنان', { min: 5, variant: true }, [
    I('milk', 300, { u: 'ml' }), I('oats', 60), I('banana', 118, { n: 1 }), I('walnuts', 20, { n: 4 }), I('dates', 24, { n: 3 }),
  ], [
    'Blend the oats and walnuts into a powder.',
    'Add the rest and blend 1 min.',
  ], [
    'طحن الشوفان والݣرݣاع حتى يوليو غبرة.',
    'زيد الباقي وطحن دقيقة.',
  ]),
  R('ocb-juice', 'drink', 'Orange, carrot and banana juice', 'عصير ليمون وخيزو وبنان', { min: 10 }, [
    I('orange-juice', 170, { u: 'ml', en: 'Oranges (2), squeezed', ar: '2 ليمونات معصورين' }), I('carrot', 60, { n: 1 }),
    I('banana', 90, { en: 'Banana (½–1)', ar: 'بنان (نص حتى وحدة)' }), I('sugar', 4, { qty: '1 tsp', opt: true }),
  ], [
    'Squeeze the oranges.',
    'Blend the carrot with ½ glass of water, then strain it.',
    'Blend everything with the banana.',
  ], [
    'عصر الليمون.',
    'طحن خيزو مع نص كاس ديال الما، ومن بعد صفيه.',
    'طحن كلشي مع البنان.',
  ]),
  R('orange-juice', 'drink', 'Fresh orange juice', 'عصير الليمون', { min: 5 }, [
    I('orange-juice', 220, { u: 'ml', en: 'Oranges (2–3), squeezed', ar: '2 حتى 3 ليمونات معصورين' }),
  ], ['Squeeze and drink fresh.'], ['عصر وشرب دغيا وهو طري.']),
  R('louiza', 'drink', 'Louiza (verbena)', 'لويزة', { min: 6 }, [
    I('verbena', 250, { u: 'ml', en: 'A few verbena leaves in hot water', ar: 'شي وريقات ديال اللويزة فالما السخون' }),
  ], ['Steep 5 min. No sugar.'], ['خليها 5 دقايق فالما السخون. بلا سكر.']),

  // ---------------- Lunches (chicken = صدر الدجاج; ~200 g raw gives 150 g cooked) ----------------
  R('fried-rice', 'lunch', 'Chicken egg fried rice', 'روز مقلي بالدجاج والبيض', { min: 30, eggs: 3, carb: 'rice', tags: ['legs'], batch: true }, [
    I('chicken-breast', 200), I('egg', 150, { n: 3 }), I('rice', 120, { carb: true, en: 'Rice (dry)', ar: 'الروز (ناشف)' }), I('onion', 110, { n: 1 }),
    I('tomato', 90, { en: 'Tomato (1 small)', ar: 'مطيشة صغيرة' }), I('pepper', 60, { en: 'Bell pepper (½)', ar: 'نص فلفلة' }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }),
    I('garlic', 8, { n: 2, en: 'Garlic (2 cloves)', ar: 'جوج فصوص ديال الثوم' }),
    SPICE('Cumin, turmeric, pepper, ground coriander', 'الكامون، الخرقوم، الإبزار، القزبور المطحون', 3),
  ], [
    'Boil the rice. Dice the chicken.',
    'Cook the chicken, onion, tomato, pepper and spices in the oil until the chicken is done.',
    'Push it aside, scramble the eggs in the pan, then mix.',
    'Add the rice and garlic and stir 5 min on low heat.',
    'On this day, no eggs at dinner.',
  ], [
    'سلق الروز. قطع الدجاج مكعبات.',
    'طيب الدجاج والبصلة ومطيشة والفلفلة والعطرية فالزيت حتى يطيب الدجاج.',
    'جمعو على جنب، خبط البيض فالمقلة وطيبو، ومن بعد خلط كلشي.',
    'زيد الروز والثوم وحرك 5 دقايق على نار هادية.',
    'فهاد النهار، بلا بيض فالعشا.',
  ]),
  R('chicken-potato-tagine', 'lunch', 'Chicken and potato tagine', 'طاجين الدجاج بالبطاطا', { min: 30, carb: 'potato', tags: ['legs'], batch: true }, [
    I('chicken-breast', 200), I('potato', 300, { carb: true }), I('onion', 110, { n: 1 }), I('carrot', 60, { n: 1 }), I('tomato', 120, { n: 1 }),
    I('pepper', 120, { n: 1 }), I('garlic', 8, { n: 2, en: 'Garlic (2 cloves)', ar: 'جوج فصوص ديال الثوم' }), I('herbs', 10, { en: 'Parsley and coriander', ar: 'المعدنوس والقزبور' }),
    SPICE('Cumin, paprika, ginger, turmeric', 'الكامون، التحميرة، سكينجبير، الخرقوم', 3), I('olive-oil', TBSP_OIL, { qty: '1 tbsp' }), I('water', 100, { u: 'ml', en: 'Water (½ glass)', ar: 'نص كاس ديال الما' }),
  ], [
    'Cut the chicken into chunks and the potatoes and carrot into cubes. Chop the onion and garlic, grate the tomato.',
    'Cook the chicken, onion, garlic and spices in the oil for 5 min.',
    'Add the vegetables and water. Cover and cook 20 min.',
    'Add the herbs at the end. If the potatoes are already boiled, add them for the last 5 min only.',
  ], [
    'قطع الدجاج طرف كبار، والبطاطا وخيزو مكعبات. قطع البصلة والثوم صغار وحك مطيشة.',
    'طيب الدجاج والبصلة والثوم والعطرية فالزيت 5 دقايق.',
    'زيد الخضرة والما. غطي وطيب 20 دقيقة.',
    'زيد المعدنوس والقزبور فالاخر. إلا كانت البطاطا مسلوقة من قبل، زيدها غير فاخر 5 دقايق.',
  ]),
  R('pot-chicken-rice', 'lunch', 'Pot chicken with rice', 'دجاج فالكوكوط بالروز', { min: 35, carb: 'rice', batch: true }, [
    I('chicken-breast', 200), I('onion', 110, { n: 1 }), I('garlic', 8, { n: 2, en: 'Garlic (2 cloves)', ar: 'جوج فصوص ديال الثوم' }), I('herbs', 10, { en: 'Parsley and coriander', ar: 'المعدنوس والقزبور' }),
    SPICE('Cumin, paprika, ginger, turmeric', 'الكامون، التحميرة، سكينجبير، الخرقوم', 3), I('veg-oil', TBSP_OIL + TSP_OIL, { qty: '1 tbsp + 1 tsp' }),
    I('water', 100, { u: 'ml', en: 'Water (½ glass)', ar: 'نص كاس ديال الما' }), I('rice', 120, { carb: true, en: 'Rice (dry)', ar: 'الروز (ناشف)' }),
    I('carrot', 60, { n: 1 }), I('peas', 60), I('tomato', 120, { n: 1 }),
  ], [
    'Cook the chicken with the onion, garlic, herbs, spices and 1 tbsp oil for 5 min.',
    'Add the water, cover and cook 20 min, then reduce the sauce.',
    'Boil the rice: twice its volume of water, 15–18 min.',
    'Cook the carrot, peas and tomato in 1 tsp oil for 10 min.',
  ], [
    'طيب الدجاج مع البصلة والثوم والمعدنوس والقزبور والعطرية وملعقة كبيرة ديال الزيت 5 دقايق.',
    'زيد الما، غطي وطيب 20 دقيقة، ومن بعد نقص المرقة.',
    'سلق الروز: ضعف الكمية ديالو ديال الما، 15 حتى 18 دقيقة.',
    'طيب خيزو والجلبانة ومطيشة فملعقة صغيرة ديال الزيت 10 دقايق.',
  ]),
  R('chicken-tomato-pasta', 'lunch', 'Chicken in tomato sauce with pasta', 'دجاج بالمطيشة والمقارونية', { min: 30, carb: 'pasta', batch: true }, [
    I('chicken-breast', 200), I('tomato', 480, { n: 4, en: 'Tomatoes (4), grated', ar: '4 مطيشات محكوكين' }), I('spices', 2, { en: 'Paprika', ar: 'التحميرة', qty: '1 tsp' }),
    I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('garlic', 8, { n: 2, en: 'Garlic (2 cloves)', ar: 'جوج فصوص ديال الثوم' }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }),
    I('pasta-dry', 120, { carb: true, en: 'Pasta (dry)', ar: 'المقارونية (ناشفة)' }),
  ], [
    'Cook the chicken and onion in the oil for 5 min.',
    'Add the tomatoes, garlic and paprika. Simmer 20 min.',
    'Boil the pasta per the packet and mix it in.',
  ], [
    'طيب الدجاج والبصلة فالزيت 5 دقايق.',
    'زيد مطيشة والثوم والتحميرة. خليه يطيب على نار هادية 20 دقيقة.',
    'سلق المقارونية كيف مكتوب فالباكية وخلطها مع الصوص.',
  ]),
  R('chermoula-chicken', 'lunch', 'Chermoula chicken with couscous', 'دجاج بالشرمولة والكسكس', { min: 35, carb: 'couscous', tags: ['legs'], batch: true }, [
    I('chicken-breast', 200), I('garlic', 8, { n: 2, en: 'Garlic (2 cloves)', ar: 'جوج فصوص ديال الثوم' }), I('herbs', 15, { en: 'Parsley and coriander', ar: 'المعدنوس والقزبور' }),
    SPICE('Cumin, paprika', 'الكامون، التحميرة', 3), SALT, I('veg-oil', TBSP_OIL + TSP_OIL, { qty: '1 tbsp + 1 tsp' }),
    I('couscous-dry', 120, { carb: true, en: 'Couscous (dry)', ar: 'الكسكس (ناشف)' }),
  ], [
    'Make the chermoula: garlic, herbs, cumin, paprika, salt and 1 tbsp oil. Rub it on the chicken and leave 30 min, or overnight.',
    'Cook covered with ½ glass of water for 20 min, then uncovered 5–10 min to brown.',
    'Couscous: pour the same volume of boiling salted water over it with 1 tsp oil. Cover 5 min, then fluff.',
  ], [
    'وجد الشرمولة: الثوم والمعدنوس والقزبور والكامون والتحميرة والملحة وملعقة كبيرة ديال الزيت. دهن بيها الدجاج وخليه 30 دقيقة، ولا الليل كامل.',
    'طيبو مغطي مع نص كاس ديال الما 20 دقيقة، ومن بعد بلا غطا 5 حتى 10 دقايق حتى يحمار.',
    'الكسكس: كب عليه نفس الكمية ديال الما المغلي بالملحة مع ملعقة صغيرة ديال الزيت. غطيه 5 دقايق، ومن بعد فركو.',
  ]),
  R('chicken-couscous-veg', 'lunch', 'Chicken couscous with vegetables', 'كسكس بالدجاج والخضرة', { min: 35, carb: 'couscous', tags: ['legs'] }, [
    I('chicken-cooked', 150, { en: 'Cooked chicken breast', ar: 'صدر الدجاج مطيب' }), I('carrot', 60, { n: 1 }), I('onion', 110, { n: 1 }), I('tomato', 120, { n: 1 }),
    I('peas', 80), SPICE('Ginger, turmeric', 'سكينجبير، الخرقوم', 2), I('water', 400, { u: 'ml', en: 'Water (2 glasses)', ar: 'جوج كيسان ديال الما' }),
    I('couscous-dry', 120, { carb: true, en: 'Couscous (dry)', ar: 'الكسكس (ناشف)' }),
  ], [
    'Simmer the vegetables, spices and water for 20 min.',
    'Add the chicken for 5 min.',
    'Prepare the couscous and pour the vegetables and broth over it.',
  ], [
    'طيب الخضرة والعطرية والما على نار هادية 20 دقيقة.',
    'زيد الدجاج 5 دقايق.',
    'وجد الكسكس وكب عليه الخضرة والمرقة.',
  ]),
  R('chicken-kefta', 'lunch', 'Chicken kefta in tomato sauce', 'كفتة ديال الدجاج بالمطيشة', { min: 35, eggs: 1, carb: 'rice', batch: true }, [
    I('chicken-breast', 200, { en: 'Chicken breast, minced', ar: 'صدر الدجاج مفروم' }), I('tomato', 360, { n: 3 }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }),
    I('herbs', 10, { en: 'Parsley and coriander', ar: 'المعدنوس والقزبور' }), SPICE('Cumin, paprika', 'الكامون، التحميرة', 3), I('egg', 50, { n: 1 }),
    I('veg-oil', TSP_OIL, { qty: '1 tsp' }), I('rice', 120, { carb: true, en: 'Rice (dry)', ar: 'الروز (ناشف)' }),
  ], [
    'Mix the minced chicken with half the herbs and spices, then roll into small balls.',
    'Cook the grated tomatoes, onion and the rest of the spices for 10 min.',
    'Add the balls, cover and cook 15 min.',
    'Crack the egg on top for the last 4 min. Serve with rice.',
  ], [
    'خلط الدجاج المفروم مع نص المعدنوس والقزبور والعطرية، ومن بعد دير كويرات صغار.',
    'طيب مطيشة المحكوكة والبصلة وباقي العطرية 10 دقايق.',
    'زيد الكويرات، غطي وطيب 15 دقيقة.',
    'هرس البيضة فوقها فاخر 4 دقايق. قدمها مع الروز.',
  ]),
  R('chicken-peas-rice', 'lunch', 'Chicken with peas and rice', 'دجاج بالجلبانة والروز', { min: 30, carb: 'rice', batch: true }, [
    I('chicken-breast', 200), I('peas', 100), I('carrot', 60, { n: 1 }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }),
    I('rice', 120, { carb: true, en: 'Rice (dry)', ar: 'الروز (ناشف)' }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }), SPICE('Turmeric', 'الخرقوم', 1),
  ], [
    'Cook the diced chicken and onion in the oil for 5 min.',
    'Add the carrot, peas, turmeric and ½ glass of water. Cover 15 min.',
    'Serve over the boiled rice.',
  ], [
    'طيب الدجاج المقطع والبصلة فالزيت 5 دقايق.',
    'زيد خيزو والجلبانة والخرقوم ونص كاس ديال الما. غطي 15 دقيقة.',
    'قدمو فوق الروز المسلوق.',
  ]),
  R('tuna-rice', 'lunch', 'Tuna rice bowl', 'روز بالطون', { min: 20, carb: 'rice' }, [
    I('tuna-oil', 100, { en: 'Tuna (1 can, drained)', ar: 'حكة ديال الطون (مصفية)' }), I('rice', 120, { carb: true, en: 'Rice (dry)', ar: 'الروز (ناشف)' }),
    I('tomato', 120, { n: 1 }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('olive-oil', TBSP_OIL, { qty: '1 tbsp' }), SPICE('Cumin', 'الكامون', 1),
  ], [
    'Boil the rice, then mix it with the tuna, chopped tomato and onion, olive oil and cumin.',
    'It is fine cold in the lunch box.',
  ], [
    'سلق الروز، ومن بعد خلطو مع الطون ومطيشة والبصلة مقطعين، وزيت الزيتون والكامون.',
    'كيتاكل حتى وهو بارد فالبواط ديال الغدا.',
  ]),
  R('fried-sardines', 'lunch', 'Pan-fried sardines with chermoula', 'سردين مقلي بالشرمولة', { min: 35, carb: 'potato' }, [
    I('sardine', 300, { en: 'Sardines, cleaned', ar: 'السردين منقي' }), I('garlic', 8, { n: 2, en: 'Chermoula: garlic', ar: 'الشرمولة: الثوم' }),
    I('herbs', 10, { en: 'Chermoula: parsley and coriander', ar: 'الشرمولة: المعدنوس والقزبور' }), SPICE('Chermoula: cumin, paprika', 'الشرمولة: الكامون، التحميرة', 3),
    I('flour', 16, { qty: '2 tbsp' }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }), I('potato', 200, { carb: true }),
  ], [
    'Rub the sardines with chermoula and leave 10 min.',
    'Dip them in flour and fry 3–4 min per side.',
    'Boil the potatoes for 15–20 min.',
  ], [
    'دهن السردين بالشرمولة وخليه 10 دقايق.',
    'دوزو فالفرينة وقليه 3 حتى 4 دقايق على كل جهة.',
    'سلق البطاطا 15 حتى 20 دقيقة.',
  ]),
  R('sardine-kefta', 'lunch', 'Sardine kefta in tomato sauce', 'كفتة ديال السردين', { min: 40, carb: 'rice' }, [
    I('sardine', 300), I('rice', 10, { en: 'Cooked rice (2 tbsp)', ar: 'جوج معالق ديال الروز مطيب' }), I('herbs', 10, { en: 'Parsley and coriander', ar: 'المعدنوس والقزبور' }),
    SPICE('Cumin, paprika', 'الكامون، التحميرة', 3), I('tomato', 360, { n: 3 }), I('garlic', 4, { n: 1 }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }),
    I('rice', 120, { carb: true, en: 'Rice (dry)', ar: 'الروز (ناشف)' }),
  ], [
    'Remove the backbones and chop the fish finely with the herbs, spices and cooked rice.',
    'Roll into balls.',
    'Simmer the grated tomatoes, garlic, spices, oil and ½ glass of water for 10 min.',
    'Add the balls and cook covered for 15 min.',
  ], [
    'حيد الحسك وفرم الحوت مزيان مع المعدنوس والقزبور والعطرية والروز المطيب.',
    'دير منو كويرات.',
    'طيب مطيشة المحكوكة والثوم والعطرية والزيت ونص كاس ديال الما على نار هادية 10 دقايق.',
    'زيد الكويرات وطيبهم مغطيين 15 دقيقة.',
  ]),
  R('sardine-potato-tagine', 'lunch', 'Sardines baked with tomato and potato', 'طاجين السردين بالبطاطا', { min: 45, carb: 'potato' }, [
    I('sardine', 300), I('herbs', 10, { en: 'Chermoula: parsley and coriander', ar: 'الشرمولة: المعدنوس والقزبور' }), SPICE('Chermoula: garlic, cumin, paprika', 'الشرمولة: الثوم، الكامون، التحميرة', 4),
    I('potato', 200, { carb: true }), I('tomato', 240, { n: 2 }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }),
  ], [
    'Lay thin potato slices in a pot, then the chermoula-rubbed sardines, then tomato slices on top.',
    'Add the oil and ½ glass of water. Cover and cook on low for 25–30 min.',
  ], [
    'صفف طرف رقاق ديال البطاطا فالكوكوط، من فوقهم السردين مدهون بالشرمولة، ومن فوق طرف ديال مطيشة.',
    'زيد الزيت ونص كاس ديال الما. غطي وطيب على نار هادية 25 حتى 30 دقيقة.',
  ]),
  R('sardine-pasta', 'lunch', 'Canned sardine pasta', 'مقارونية بالسردين ديال الحك', { min: 20, carb: 'pasta' }, [
    I('sardine-can', 90, { en: 'Sardines (1 can)', ar: 'حكة ديال السردين' }), I('pasta-dry', 120, { carb: true, en: 'Pasta (dry)', ar: 'المقارونية (ناشفة)' }),
    I('tomato', 240, { n: 2 }), I('garlic', 4, { n: 1 }), SPICE('Cumin, paprika', 'الكامون، التحميرة', 2), I('veg-oil', TSP_OIL, { qty: '1 tsp' }),
  ], [
    'Cook the grated tomatoes, garlic, spices and oil for 5 min.',
    'Add the sardines, broken up with a fork.',
    'Mix with the boiled pasta.',
  ], [
    'طيب مطيشة المحكوكة والثوم والعطرية والزيت 5 دقايق.',
    'زيد السردين وفرقو بالفورشيط.',
    'خلطو مع المقارونية المسلوقة.',
  ]),

  // ---------------- Dinners (served with 2 eggs, ½ khobz and 200 ml milk unless noted) ----------------
  R('lentils', 'dinner', 'Lentil tagine', 'عدس', { min: 45, sides: true, batch: true }, [
    I('lentils-dry', 70, { en: 'Lentils (dry)', ar: 'العدس (ناشف)' }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('tomato', 120, { n: 1 }),
    I('carrot', 30, { en: 'Carrot (½)', ar: 'نص خيزو' }), I('garlic', 4, { n: 1 }), SPICE('Cumin, paprika', 'الكامون، التحميرة', 2),
    I('veg-oil', TSP_OIL, { qty: '1 tsp' }), I('water', 350, { u: 'ml' }),
  ], [
    'Rinse the lentils.',
    'Put everything in a pot, bring to a boil, then cook half-covered for 35–40 min until thick.',
    'Batch: ×3 for 3 days.',
  ], [
    'غسل العدس.',
    'دير كلشي فالكوكوط، خليه يغلي، ومن بعد طيبو نص مغطي 35 حتى 40 دقيقة حتى يغلاظ.',
    'للتحضير المسبق: ×3 لتلت أيام.',
  ]),
  R('white-beans', 'dinner', 'White beans', 'لوبيا', { min: 120, sides: true, batch: true }, [
    I('white-beans-dry', 70, { en: 'White beans (dry)', ar: 'اللوبيا البيضا (ناشفة)' }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('tomato', 120, { n: 1 }),
    I('carrot', 30, { en: 'Carrot (½)', ar: 'نص خيزو' }), I('garlic', 4, { n: 1 }), SPICE('Cumin, paprika', 'الكامون، التحميرة', 2), I('veg-oil', TSP_OIL, { qty: '1 tsp' }),
  ], [
    'Soak overnight.',
    'Boil 45–60 min.',
    'Add the vegetables and spices and cook 30 min more.',
  ], [
    'نقع اللوبيا الليل كامل.',
    'سلقها 45 حتى 60 دقيقة.',
    'زيد الخضرة والعطرية وطيب 30 دقيقة أخرى.',
  ]),
  R('chickpeas-tomato', 'dinner', 'Chickpeas with tomato', 'حمص بالمطيشة', { min: 120, sides: true, batch: true }, [
    I('chickpeas-dry', 70, { en: 'Chickpeas (dry)', ar: 'الحمص (يابس)' }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('tomato', 120, { n: 1 }),
    I('carrot', 30, { en: 'Carrot (½)', ar: 'نص خيزو' }), I('garlic', 4, { n: 1 }), SPICE('Cumin, paprika', 'الكامون، التحميرة', 2), I('veg-oil', TSP_OIL, { qty: '1 tsp' }),
  ], [
    'Soak overnight.',
    'Cook as for the white beans: boil, then add the vegetables and spices (1.5–2 h in total).',
  ], [
    'نقع الحمص الليل كامل.',
    'طيبو بحال اللوبيا: سلقو، ومن بعد زيد الخضرة والعطرية (ساعة ونص حتى جوج سوايع فالمجموع).',
  ]),
  R('harira', 'dinner', 'Harira', 'حريرة', { min: 90, sides: true, batch: true }, [
    I('lentils-dry', 35), I('chickpeas-dry', 35, { en: 'Chickpeas, soaked', ar: 'الحمص منقوع' }), I('tomato', 120, { n: 1 }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }),
    I('herbs', 10, { en: 'Parsley and coriander', ar: 'المعدنوس والقزبور' }), SPICE('Ginger, turmeric, pepper', 'سكينجبير، الخرقوم، الإبزار', 2),
    I('veg-oil', TSP_OIL, { qty: '1 tsp' }), I('flour', 10), I('water', 500, { u: 'ml' }),
  ], [
    'Cook everything except the lentils and flour for 45 min.',
    'Add the lentils and cook 35 min.',
    'Stir in the flour mixed with a little water and cook 5 min.',
  ], [
    'طيب كلشي من غير العدس والفرينة 45 دقيقة.',
    'زيد العدس وطيب 35 دقيقة.',
    'زيد الفرينة مخلوطة مع شوية ديال الما وحرك، وطيب 5 دقايق.',
  ]),
  R('potato-omelette', 'dinner', 'Potato omelette', 'أومليط بالبطاطا', { min: 25, eggs: 3, sidesNoEggs: true }, [
    I('potato', 200), I('egg', 150, { n: 3 }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }),
  ], [
    'Cook thin potato slices in the oil, covered, for 10 min. Add the onion halfway.',
    'Pour in the beaten eggs. Cover and cook on low for 5 min.',
  ], [
    'طيب طرف رقاق ديال البطاطا فالزيت مغطيين 10 دقايق. زيد البصلة فالنص.',
    'كب البيض المخبوط. غطي وطيب على نار هادية 5 دقايق.',
  ]),
  R('bissara', 'dinner', 'Bissara', 'بيصارة', { min: 50, sides: true, batch: true }, [
    I('fava-dry', 70, { en: 'Dried split fava beans', ar: 'الفول المقشر' }), I('garlic', 8, { n: 2 }), SPICE('Cumin', 'الكامون', 1),
    I('olive-oil', TBSP_OIL, { qty: '1 tbsp' }), I('water', 400, { u: 'ml' }),
  ], [
    'Simmer the beans and garlic in the water for 40 min until soft.',
    'Blend until smooth.',
    'Serve with cumin and olive oil on top.',
  ], [
    'طيب الفول والثوم فالما على نار هادية 40 دقيقة حتى يرطاب.',
    'طحنو حتى يولي ناعم.',
    'قدمها بالكامون وزيت الزيتون من فوق.',
  ]),
  R('egg-potato-tagine', 'dinner', 'Egg and potato tagine', 'طاجين البيض والبطاطا', { min: 30, eggs: 3, sidesNoEggs: true }, [
    I('egg', 150, { n: 3 }), I('potato', 200), I('tomato', 120, { n: 1 }), I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }),
    I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }), SPICE('Cumin, paprika', 'الكامون، التحميرة', 2),
  ], [
    'Cook the potato cubes, onion, tomato and spices with ½ glass of water, covered, for 20 min.',
    'Crack the eggs on top, cover and cook 5 min.',
  ], [
    'طيب البطاطا مكعبات والبصلة ومطيشة والعطرية مع نص كاس ديال الما، مغطيين، 20 دقيقة.',
    'هرس البيض فوقها، غطي وطيب 5 دقايق.',
  ]),
  R('mjadra', 'dinner', 'Lentils with rice (mjadra)', 'عدس بالروز', { min: 35, sides: true, batch: true }, [
    I('lentils-dry', 50), I('rice', 40, { en: 'Rice (dry)', ar: 'الروز (ناشف)' }), I('onion', 110, { n: 1 }), I('veg-oil', TBSP_OIL, { qty: '1 tbsp' }), SPICE('Cumin', 'الكامون', 1),
  ], [
    'Boil the lentils 15 min.',
    'Add the rice and cook 15 min more.',
    'Top with the onion, fried golden in the oil.',
  ], [
    'سلق العدس 15 دقيقة.',
    'زيد الروز وطيب 15 دقيقة أخرى.',
    'زيد فوقو البصلة مقلية فالزيت حتى تحمار.',
  ]),
  R('vermicelli-soup', 'dinner', 'Chicken vermicelli soup', 'شوربة الشعرية بالدجاج', { min: 25, sides: true }, [
    I('chicken-cooked', 100, { en: 'Cooked chicken breast', ar: 'صدر الدجاج مطيب' }), I('vermicelli', 40), I('tomato', 120, { n: 1 }),
    I('onion', 55, { en: 'Onion (½)', ar: 'نص بصلة' }), I('carrot', 30, { en: 'Carrot (½)', ar: 'نص خيزو' }), I('herbs', 5, { en: 'Parsley', ar: 'المعدنوس' }),
    SPICE('Ginger, turmeric', 'سكينجبير، الخرقوم', 2), I('water', 500, { u: 'ml' }),
  ], [
    'Simmer the vegetables and spices for 15 min.',
    'Add the vermicelli and chicken and cook 5 min.',
  ], [
    'طيب الخضرة والعطرية على نار هادية 15 دقيقة.',
    'زيد الشعرية والدجاج وطيب 5 دقايق.',
  ]),

  // ---------------- Snacks ----------------
  R('work-snack', 'snack', 'Work snack', 'سناك الخدمة', { min: 2 }, [
    I('bread-ww', 60, { en: '½ whole-wheat khobz', ar: '½ خبز الفارينة الكاملة' }), I('olive-oil', TBSP_OIL, { qty: '1 tbsp' }), I('dates', 24, { n: 3 }),
  ], ['Pack the bread, a small pot of olive oil and the dates for work.'], ['وجد الخبز وشوية ديال زيت الزيتون فبواط صغير والتمر للخدمة.']),
  R('khobz-jben', 'snack', 'Khobz with jben', 'خبز بالجبن', { min: 2, variant: true }, [
    I('bread-ww', 60, { en: '½ whole-wheat khobz', ar: '½ خبز الفارينة الكاملة' }), I('jben', 50), I('olive-oil', TSP_OIL, { qty: '1 tsp' }),
  ], ['Fill the bread with the jben and a drizzle of olive oil.'], ['عمر الخبز بالجبن وشوية ديال زيت الزيتون.']),
  R('banana-peanuts', 'snack', 'Banana and peanuts', 'بنان وكاوكاو', { min: 1, variant: true }, [
    I('banana', 118, { n: 1 }), I('peanuts', 30),
  ], ['Pack a banana and a small bag of peanuts.'], ['وجد بنانة وشوية ديال الكاوكاو فخنشة صغيرة.']),
  R('raib-dates', 'snack', 'Raib and dates', 'رايب وتمر', { min: 1, variant: true }, [
    I('raib', 110, { n: 1 }), I('dates', 32, { n: 4 }),
  ], ['Eat the raib with the dates.'], ['كول الرايب مع التمر.']),
  R('brownie', 'snack', 'Banana oat brownie (2 pieces)', 'براوني بالبنان والشوفان (2 طرف)', { min: 25, eggs: 0.67, batch: true, serves: 3 }, [
    I('banana', 236, { n: 2 }), I('egg', 100, { n: 2 }), I('oats', 80, { en: 'Oats, blended', ar: 'الشوفان مطحون' }), I('cocoa', 10, { qty: '2 tbsp' }), I('baking-powder', 4, { qty: '1 tsp' }),
  ], [
    'Mash the bananas and mix everything together.',
    'Bake at 180 °C for 15–20 min.',
    'Top with a raib once it is cool. The tray makes 6 pieces (2 per snack).',
  ], [
    'هرس البنان وخلط كلشي مع بعضو.',
    'دخلو للفران على 180 درجة 15 حتى 20 دقيقة.',
    'ملي يبرد زيد فوقو رايب. الصينية كتعطي 6 طرف (جوج لكل سناك).',
  ]),
  R('ocb-snack', 'snack', 'Orange, carrot and banana juice', 'عصير ليمون وخيزو وبنان', { min: 10, same: 'ocb-juice' }, null, null, null),

  // ---------------- Pre-gym ----------------
  R('pregym', 'pregym', 'Pre-gym snack', 'قبل التمرين', { min: 1 }, [
    I('raib', 110, { n: 1 }), I('banana', 118, { n: 1 }),
  ], ['Eat 30–60 min before training.'], ['كولو 30 حتى 60 دقيقة قبل التمرين.']),
  R('pregym-dates', 'pregym', 'Banana and dates', 'بنان وتمر', { min: 1, variant: true }, [
    I('banana', 118, { n: 1 }), I('dates', 24, { n: 3 }),
  ], ['Eat 30–60 min before training.'], ['كولو 30 حتى 60 دقيقة قبل التمرين.']),
  R('pregym-raib-dates', 'pregym', 'Raib and dates', 'رايب وتمر', { min: 1, variant: true }, [
    I('raib', 110, { n: 1 }), I('dates', 32, { n: 4 }),
  ], ['Eat 30–60 min before training.'], ['كولو 30 حتى 60 دقيقة قبل التمرين.']),
  R('pregym-khobz', 'pregym', 'Khobz and dates', 'خبز وتمر', { min: 1, variant: true }, [
    I('bread-ww', 40, { en: '⅓ whole-wheat khobz', ar: '⅓ خبز الفارينة الكاملة' }), I('dates', 24, { n: 3 }),
  ], ['Eat 30–60 min before training.'], ['كولو 30 حتى 60 دقيقة قبل التمرين.']),
  R('pregym-brownie', 'pregym', 'Brownie and banana', 'براوني وبنانة', { min: 1, variant: true, eggs: 0.33 }, [
    I('@brownie', 0.5, { en: 'Banana oat brownie (1 piece)', ar: 'طرف ديال البراوني بالبنان' }), I('banana', 118, { n: 1 }),
  ], ['Eat 30–60 min before training.'], ['كولو 30 حتى 60 دقيقة قبل التمرين.']),
  R('pregym-juice', 'pregym', 'Orange, carrot and banana juice', 'عصير ليمون وخيزو وبنان', { min: 10, same: 'ocb-juice' }, null, null, null),
];

// Dishes that reuse another recipe in a second slot (e.g. the juice as a snack)
for (const r of RECIPES) {
  if (!r.same) continue;
  const src = RECIPES.find((x) => x.id === r.same);
  r.ing = src.ing; r.steps = src.steps;
}

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Sides served with dinner (unless the dish says otherwise). */
export const DINNER_SIDES = [
  I('egg', 100, { n: 2, en: '2 eggs', ar: 'جوج بيضات' }),
  I('bread-ww', 60, { en: '½ whole-wheat khobz', ar: '½ خبز الفارينة الكاملة' }),
  I('milk', 200, { u: 'ml', en: 'A glass of milk', ar: 'كاس ديال الحليب' }),
];

export const SLOTS = ['breakfast', 'shake', 'lunch', 'snack', 'pregym', 'dinner', 'bedtime'];
