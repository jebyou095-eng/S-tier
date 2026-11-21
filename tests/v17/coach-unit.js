const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e)));
  await p.route(/github/, r => r.abort());
  await p.goto('http://localhost:8765/'); await p.waitForSelector('.chip');
  const out = await p.evaluate(async () => {
    const c = await import('./js/coach.js'); const st = await import('./js/stats.js');
    const today = '2026-11-10';
    const T = (day, min) => new Date(`${day}T18:00`).getTime() + min * 60000;
    // Build a history: Full body 3x/week; user does only the first N exercises, 3 sets each, ~2.5 min/set
    const mk = (days, plan, opts = {}) => {
      const log = [];
      days.forEach((day, k) => {
        const pday = `fb3:${k % 2}`;
        const list = plan(pday, k);
        let t = 0;
        for (const [ex, sets] of list) for (let i = 0; i < sets; i++) { log.push({ id: `${day}${ex}${i}`, day, ts: T(day, t), ex, kg: 40, reps: 8, pday }); t += 2.5; }
      });
      return log;
    };
    const days = ['2026-10-20', '2026-10-22', '2026-10-24', '2026-10-27', '2026-10-29', '2026-10-31', '2026-11-03', '2026-11-05', '2026-11-07'];
    const res = {};
    // A) Always stops after ~3 exercises (runs out of time)
    let gym = { program: 'fb3', adapt: { on: true, swaps: {}, removed: [], ignore: {}, dismissed: [] }, sessions: [],
      log: mk(days, (pday) => c.planned(pday).slice(0, 3).map(([id, n]) => [id, n])) };
    let a = c.analyze(gym, today);
    let plan = c.adaptPlan(gym, 1, a);
    res.A_stopsEarly = { completion: +a.completionAvg.toFixed(2), typicalMin: Math.round(a.typicalMinutes), setMin: a.setMinutes, plannedMin: plan.minutes, budget: plan.budget, items: plan.items.map((x) => `${x.id}×${x.sets}`), change: plan.changes.map((x) => x.text) };
    // B) Skips lateral-raise (planned on Day A) but does everything after it
    gym = { ...gym, log: mk(days, (pday) => c.planned(pday).filter(([id]) => id !== 'lateral-raise')) };
    a = c.analyze(gym, today);
    res.B_skips = { completion: +a.completionAvg.toFixed(2), suggestions: c.suggestions(gym, a).map((s) => `${s.type}: ${s.text} → alt ${s.alt || '-'}`) };
    // B2) After swapping, the replacement counts and the suggestion disappears
    gym.adapt = { ...gym.adapt, swaps: { 'lateral-raise': 'db-shoulder-press' } };
    gym.log = gym.log.concat(mk(['2026-11-09'], () => c.planned('fb3:0').map(([id, n]) => [id === 'lateral-raise' ? 'db-shoulder-press' : id, n])).map((x) => ({ ...x, pday: 'fb3:0' })));
    a = c.analyze(gym, today);
    res.B2_afterSwap = { lastCompletion: +a.lastSession.completion.toFixed(2), suggestions: c.suggestions(gym, a).length, planFirst: c.adaptPlan(gym, 0, a).items.map((x) => x.id) };
    // C) Unfinished last session → repeat same day
    gym = { program: 'fb3', adapt: { on: true, swaps: {}, removed: [], ignore: {}, dismissed: [] }, sessions: [],
      log: mk(['2026-11-08'], (pday) => c.planned(pday).slice(0, 2).map(([id]) => [id, 1])) };
    a = c.analyze(gym, today);
    res.C_repeat = c.nextDay(gym, { days: [['Day A'], ['Day B']] }, a, today);
    // D) Long break → welcome back
    gym = { ...gym, log: mk(['2026-10-20'], (pday) => c.planned(pday)) };
    a = c.analyze(gym, today);
    plan = c.adaptPlan(gym, 1, a);
    res.D_break = { daysSince: a.daysSinceLast, welcome: plan.welcomeBack, sets: plan.items.map((x) => x.sets).join(','), change: plan.changes[0]?.text };
    // E) Upper/Lower but trains ~1.7 days/week → suggest full body
    gym = { program: 'ul4', adapt: { on: true, swaps: {}, removed: [], ignore: {}, dismissed: [] }, sessions: [],
      log: ['2026-10-21', '2026-10-24', '2026-10-28', '2026-11-01', '2026-11-04', '2026-11-08'].flatMap((day, k) => c.planned(`ul4:${k % 4}`).map(([id, n], i) => ({ id: day + id, day, ts: T(day, i * 8), ex: id, kg: 40, reps: 8, pday: `ul4:${k % 4}` }))) };
    a = c.analyze(gym, today);
    res.E_frequency = { perWeek: +a.perWeek.toFixed(2), suggestions: c.suggestions(gym, a).map((s) => s.type + ': ' + s.text) };
    // F) Two "too much" ratings → fewer isolation sets; user time budget 30 min
    gym = { program: 'fb3', adapt: { on: true, minutes: 30, swaps: {}, removed: [], ignore: {}, dismissed: [] },
      sessions: [{ day: '2026-11-05', pday: 'fb3:1', rating: 'too-much' }, { day: '2026-11-07', pday: 'fb3:0', rating: 'too-much' }], log: mk(days, (pday) => c.planned(pday)) };
    a = c.analyze(gym, today);
    plan = c.adaptPlan(gym, 0, a);
    res.F_tooMuch_30min = { minutes: plan.minutes, items: plan.items.map((x) => `${x.id}×${x.sets}`), changes: plan.changes.map((x) => x.key) };
    // G) Deload tip after two sessions below range
    const hist = [{ day: '2026-11-07', sets: [{ kg: 60, reps: 4 }, { kg: 60, reps: 4 }] }, { day: '2026-11-05', sets: [{ kg: 60, reps: 5 }] }];
    res.G_deload = c.loadTip({ kind: 'compound', group: 'Legs' }, '6–10', hist);
    // H) Coach off → plan untouched
    gym.adapt.on = false; a = c.analyze(gym, today); plan = c.adaptPlan(gym, 0, a);
    res.H_off = { changes: plan.changes.length, sets: plan.items.map((x) => x.sets).join(',') };
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
