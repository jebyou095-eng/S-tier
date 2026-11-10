import * as vault from './db.js';
import {
  dayKey, parseDay, addDays, dayRange, entriesByDay, dailyValue, series, summarize, streaks, byWeekday, correlations,
} from './stats.js';
import { barChart, heatmap, weekdayChart } from './charts.js';
import { h, uid, dayLabel, toast, modal, confirmDialog } from './ui.js';
import { viewFood, freshFood, normalizeFood, foodSettingsCard, resetFoodView } from './food.js';
import { viewGym, freshGym, normalizeGym, resetGymView } from './gym.js';
import { loadFoodDb } from './fooddb.js';

/** Load the Moroccan food list (built into the Android app, or from the data server). */
function warmFoodDb() {
  if (state?.food?.moroccoDb === false) return;
  loadFoodDb().then(() => { if (view === 'settings') render(); }).catch(() => { /* offline: try again next launch */ });
}


const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');

const COLORS = ['#2f7d6d', '#3b6fb6', '#b5523b', '#8a5bb0', '#c08a1e', '#c2477a', '#4f8a2e', '#5f6b7a'];
const TYPES = { number: 'Number', rating: 'Rating 1–5', check: 'Yes / No' };
const STARTERS = [
  { name: 'Mood', type: 'rating', color: '#8a5bb0' },
  { name: 'Sleep', type: 'number', unit: 'h', agg: 'last', goal: 8, color: '#3b6fb6' },
  { name: 'Water', type: 'number', unit: 'glasses', agg: 'sum', goal: 8, color: '#2f7d6d' },
  { name: 'Exercise', type: 'check', color: '#b5523b' },
  { name: 'Spending', type: 'number', unit: '$', agg: 'sum', color: '#c08a1e' },
];

const num = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

let state = null;
let view = 'today';
let curDay = dayKey();
let range = 30;
let historyFilter = '';
let historyLimit = 100;
let hiddenAt = 0;

// ---------- state ----------
function freshState() {
  return { v: 1, trackers: [], entries: [], settings: { autoLock: 1 }, food: freshFood(), gym: freshGym() };
}

/** Validate anything that comes from disk or a backup file. */
function normalize(raw) {
  const out = freshState();
  if (!raw || typeof raw !== 'object') return out;
  const str = (x, max = 60) => String(x ?? '').slice(0, max);
  const ids = new Set();
  for (const t of Array.isArray(raw.trackers) ? raw.trackers : []) {
    if (!t || !t.id || ids.has(String(t.id))) continue;
    const type = TYPES[t.type] ? t.type : 'number';
    ids.add(String(t.id));
    out.trackers.push({
      id: str(t.id, 40),
      name: str(t.name) || 'Untitled',
      type,
      unit: type === 'number' ? str(t.unit, 16) : '',
      agg: ['sum', 'avg', 'last'].includes(t.agg) ? t.agg : 'sum',
      goal: Number.isFinite(+t.goal) && +t.goal > 0 && type === 'number' ? +t.goal : null,
      color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : COLORS[0],
    });
  }
  for (const e of Array.isArray(raw.entries) ? raw.entries : []) {
    if (!e || !ids.has(String(e.trackerId)) || !/^\d{4}-\d{2}-\d{2}$/.test(e.day) || !Number.isFinite(+e.value)) continue;
    out.entries.push({ id: str(e.id || uid(), 40), trackerId: String(e.trackerId), day: e.day, value: +e.value, ts: Number.isFinite(+e.ts) ? +e.ts : Date.now() });
  }
  const al = raw.settings?.autoLock;
  out.settings.autoLock = [0, 1, 5, 15, -1].includes(al) ? al : 1;
  out.food = normalizeFood(raw.food);
  out.gym = normalizeGym(raw.gym);
  return out;
}

async function commit() {
  try {
    await vault.save(state);
  } catch (err) {
    toast(`Couldn't save: ${err.message}`);
  }
  render();
}

const tracker = (id) => state.trackers.find((t) => t.id === id);

function formatValue(t, v) {
  if (v === null || v === undefined) return '—';
  if (t.type === 'check') return v ? 'Done' : '—';
  if (t.type === 'rating') return `${num1.format(v)} / 5`;
  if (t.unit === '$' || t.unit === '€' || t.unit === '£') return `${t.unit}${num.format(v)}`;
  return t.unit ? `${num.format(v)} ${t.unit}` : num.format(v);
}



function passcodeDialog(title, { confirm = false, hint } = {}) {
  return modal((done) => {
    const p1 = h('input', { type: 'password', autocomplete: 'off', autofocus: true, required: true, minlength: 4, placeholder: 'Passcode' });
    const p2 = confirm ? h('input', { type: 'password', autocomplete: 'off', required: true, placeholder: 'Repeat passcode' }) : null;
    const err = h('p', { class: 'error', hidden: true });
    const form = h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        if (p1.value.length < 4) { err.textContent = 'Use at least 4 characters.'; err.hidden = false; return; }
        if (p2 && p1.value !== p2.value) { err.textContent = "Passcodes don't match."; err.hidden = false; return; }
        done(p1.value);
      },
    },
    h('h2', {}, title),
    hint ? h('p', { class: 'muted' }, hint) : null,
    h('label', { class: 'field' }, p1),
    p2 ? h('label', { class: 'field' }, p2) : null,
    err,
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Continue')));
    return form;
  });
}

function trackerDialog(existing) {
  const t = existing ? { ...existing } : { name: '', type: 'number', unit: '', agg: 'sum', goal: null, color: COLORS[state.trackers.length % COLORS.length] };
  return modal((done) => {
    const name = h('input', { value: t.name, maxlength: 60, required: true, autofocus: !existing, placeholder: 'e.g. Coffee, Steps, Mood' });
    const type = h('select', {}, ...Object.entries(TYPES).map(([k, v]) => h('option', { value: k, selected: k === t.type }, v)));
    const unit = h('input', { value: t.unit, maxlength: 16, placeholder: 'e.g. cups, km, $' });
    const agg = h('select', {},
      h('option', { value: 'sum', selected: t.agg === 'sum' }, 'Add them up (water, money, steps)'),
      h('option', { value: 'avg', selected: t.agg === 'avg' }, 'Average them (heart rate, temperature)'),
      h('option', { value: 'last', selected: t.agg === 'last' }, 'Keep the latest (weight, sleep)'));
    const goal = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, value: t.goal ?? '', placeholder: 'Optional' });
    let color = t.color;
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
    const paint = () => {
      swatches.replaceChildren(...COLORS.map((c) => h('button', {
        type: 'button', class: `swatch${c === color ? ' on' : ''}`, css: { '--c': c }, role: 'radio', 'aria-checked': String(c === color), 'aria-label': c,
        onclick: () => { color = c; paint(); },
      })));
    };
    paint();
    const numberOnly = h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Unit'), unit),
      h('label', { class: 'field' }, h('span', {}, 'Several entries in one day'), agg),
      h('label', { class: 'field' }, h('span', {}, 'Daily goal'), goal));
    const sync = () => { numberOnly.hidden = type.value !== 'number'; };
    type.addEventListener('change', sync);
    sync();
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        done({
          ...t,
          id: t.id || uid(),
          name: name.value.trim(),
          type: type.value,
          unit: type.value === 'number' ? unit.value.trim() : '',
          agg: agg.value,
          goal: type.value === 'number' && +goal.value > 0 ? +goal.value : null,
          color,
        });
      },
    },
    h('h2', {}, existing ? 'Edit tracker' : 'New tracker'),
    h('label', { class: 'field' }, h('span', {}, 'Name'), name),
    h('label', { class: 'field' }, h('span', {}, 'Type'), type),
    numberOnly,
    h('div', { class: 'field' }, h('span', {}, 'Color'), swatches),
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn primary' }, existing ? 'Save' : 'Add tracker')));
  });
}

async function addTracker() {
  const t = await trackerDialog(null);
  if (!t) return;
  state.trackers.push(t);
  await commit();
}

async function editTracker(t) {
  const next = await trackerDialog(t);
  if (!next) return;
  if (next.type !== t.type && state.entries.some((e) => e.trackerId === t.id)) {
    const ok = await confirmDialog('Change type?', `${t.name} already has entries. Changing its type keeps the numbers but they may read oddly.`, 'Change');
    if (!ok) return;
  }
  Object.assign(t, next);
  await commit();
}

// ---------- logging ----------
function log(t, value) {
  const ts = curDay === dayKey() ? Date.now() : parseDay(curDay).getTime() + 12 * 3600 * 1000;
  state.entries.push({ id: uid(), trackerId: t.id, day: curDay, value, ts });
}

function dayEntries(t) {
  return state.entries.filter((e) => e.trackerId === t.id && e.day === curDay);
}

async function toggleCheck(t) {
  const existing = dayEntries(t);
  if (existing.length) state.entries = state.entries.filter((e) => !existing.includes(e));
  else log(t, 1);
  await commit();
}

async function setRating(t, v) {
  const existing = dayEntries(t);
  const same = existing.length === 1 && existing[0].value === v;
  state.entries = state.entries.filter((e) => !existing.includes(e));
  if (!same) log(t, v);
  await commit();
}

async function addNumber(t, input) {
  const v = parseFloat(String(input.value).replace(',', '.'));
  if (!Number.isFinite(v)) { input.focus(); return; }
  if (t.agg === 'last') state.entries = state.entries.filter((e) => !(e.trackerId === t.id && e.day === curDay));
  log(t, v);
  await commit();
  toast(`${t.name}: ${formatValue(t, v)} logged`);
}

async function undoLast(t) {
  const list = dayEntries(t).sort((a, b) => b.ts - a.ts);
  if (!list.length) return;
  state.entries = state.entries.filter((e) => e !== list[0]);
  await commit();
  toast('Removed last entry');
}

// ---------- views ----------
function viewToday() {
  const today = dayKey();
  const head = h('header', { class: 'day-nav' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => { curDay = addDays(curDay, -1); render(); } }, '‹'),
    h('div', { class: 'day-title' },
      h('h1', {}, dayLabel(curDay)),
      curDay !== today ? h('button', { class: 'link', onclick: () => { curDay = today; render(); } }, 'Back to today') : null),
    h('button', { class: 'icon-btn', 'aria-label': 'Next day', disabled: curDay >= today, onclick: () => { curDay = addDays(curDay, 1); render(); } }, '›'));

  if (!state.trackers.length) {
    const picked = new Set();
    const addBtn = h('button', {
      class: 'btn primary wide', disabled: true,
      onclick: async () => {
        for (const s of STARTERS.filter((x) => picked.has(x.name))) {
          state.trackers.push({ ...s, id: uid(), unit: s.unit || '', agg: s.agg || 'sum', goal: s.goal || null });
        }
        await commit();
      },
    }, 'Add selected');
    return h('section', {}, head,
      h('div', { class: 'card empty' },
        h('h2', {}, 'What do you want to track?'),
        h('p', { class: 'muted' }, 'Pick a few to start, or make your own. You can change them any time.'),
        h('div', { class: 'chips' }, ...STARTERS.map((s) => h('button', {
          class: 'chip', 'aria-pressed': 'false',
          onclick: (e) => {
            if (picked.has(s.name)) picked.delete(s.name); else picked.add(s.name);
            const on = picked.has(s.name);
            e.currentTarget.classList.toggle('on', on);
            e.currentTarget.setAttribute('aria-pressed', String(on));
            addBtn.disabled = !picked.size;
            addBtn.textContent = picked.size ? `Add ${picked.size} tracker${picked.size > 1 ? 's' : ''}` : 'Add selected';
          },
        }, s.name))),
        addBtn,
        h('button', { class: 'btn ghost wide', onclick: addTracker }, 'Create custom tracker')));
  }

  const cards = state.trackers.map((t) => {
    const entries = dayEntries(t);
    const v = dailyValue(t, entries);
    const card = h('article', { class: 'card tracker', css: { '--c': t.color } });
    const title = h('div', { class: 'tracker-head' },
      h('span', { class: 'dot' }),
      h('h2', {}, t.name),
      h('span', { class: 'value' }, t.type === 'check' ? '' : formatValue(t, v)));
    card.append(title);

    if (t.type === 'check') {
      const { current } = streaks(state, t, today);
      card.append(h('div', { class: 'row' },
        h('button', { class: `toggle${v ? ' on' : ''}`, 'aria-pressed': String(!!v), onclick: () => toggleCheck(t) }, v ? '✓ Done' : 'Mark done'),
        current ? h('span', { class: 'muted small' }, `🔥 ${current}-day streak`) : null));
    } else if (t.type === 'rating') {
      card.append(h('div', { class: 'rating', role: 'group', 'aria-label': `${t.name} rating` },
        ...[1, 2, 3, 4, 5].map((n) => h('button', {
          class: `rate${v === n ? ' on' : ''}`, 'aria-pressed': String(v === n), onclick: () => setRating(t, n),
        }, String(n)))));
    } else {
      const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: t.unit || 'Value', 'aria-label': `${t.name} value`, enterkeyhint: 'done' });
      const form = h('form', { class: 'row log', onsubmit: (e) => { e.preventDefault(); addNumber(t, input); } },
        input,
        h('button', { class: 'btn primary', type: 'submit' }, t.agg === 'sum' ? 'Add' : 'Log'),
        entries.length ? h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Undo last entry', onclick: () => undoLast(t) }, 'Undo') : null);
      if (t.goal) {
        const pct = Math.min(1, (v || 0) / t.goal);
        card.append(h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round(pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
          h('div', { css: { width: `${pct * 100}%` } })),
        h('p', { class: 'muted small' }, `Goal ${formatValue(t, t.goal)}${pct >= 1 ? ' — reached 🎉' : ''}`));
      }
      card.append(form);
    }
    return card;
  });

  return h('section', {}, head, ...cards,
    h('button', { class: 'btn ghost wide', onclick: addTracker }, '+ Add tracker'));
}

function statTile(label, value) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));
}

function trendText(t, s) {
  if (s.trend === undefined || Math.abs(s.trend) < 1e-9) return '→ steady';
  const arrow = s.trend > 0 ? '↑' : '↓';
  if (s.trendPct !== null && Number.isFinite(s.trendPct)) return `${arrow} ${Math.round(Math.abs(s.trendPct) * 100)}%`;
  return `${arrow} ${num1.format(Math.abs(s.trend))}`;
}

let insightsSub = 'charts';

function insightsSwitch() {
  return h('div', { class: 'chips seg seg2', role: 'tablist' }, ...[['charts', 'Charts'], ['history', 'History']].map(([k, l]) => h('button', {
    class: `chip${k === insightsSub ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === insightsSub), onclick: () => { insightsSub = k; render(); },
  }, l)));
}

function viewInsightsTab() {
  const sec = insightsSub === 'history' ? viewHistory() : viewInsights();
  sec.prepend(insightsSwitch());
  return sec;
}

function viewInsights() {
  const today = dayKey();
  const days = dayRange(today, range);
  const chips = h('div', { class: 'chips seg', role: 'tablist' }, ...[7, 30, 90, 365].map((n) => h('button', {
    class: `chip${n === range ? ' on' : ''}`, role: 'tab', 'aria-selected': String(n === range), onclick: () => { range = n; render(); },
  }, { 7: 'Week', 30: 'Month', 90: '3 months', 365: 'Year' }[n])));

  if (!state.trackers.length) {
    return h('section', {}, h('h1', {}, 'Insights'), h('p', { class: 'muted card' }, 'Add a tracker on the Today tab and your charts will show up here.'));
  }

  const cards = state.trackers.map((t) => {
    const vals = series(state, t, days);
    const s = summarize(t, vals);
    const card = h('article', { class: 'card', css: { '--c': t.color } },
      h('div', { class: 'tracker-head' }, h('span', { class: 'dot' }), h('h2', {}, t.name), h('span', { class: 'muted small' }, `${s.n} of ${s.days} days`)));
    if (!s.n) {
      card.append(h('p', { class: 'muted' }, 'Nothing logged in this period yet.'));
      return card;
    }
    if (t.type === 'check') {
      const st = streaks(state, t, today);
      card.append(h('div', { class: 'stats' },
        statTile('Done', `${Math.round(s.rate * 100)}%`),
        statTile('Streak', `${st.current}d`),
        statTile('Best', `${st.best}d`)));
      card.append(heatmap({ days, values: vals, color: t.color, label: `${t.name} calendar` }));
    } else {
      const tiles = [statTile(t.type === 'number' && t.agg === 'sum' ? 'Daily avg' : 'Average', formatValue(t, s.mean))];
      if (t.type === 'number' && t.agg === 'sum') tiles.push(statTile('Total', formatValue(t, s.total)));
      else tiles.push(statTile('Range', `${num1.format(s.min)}–${num1.format(s.max)}`));
      tiles.push(statTile('Trend', trendText(t, s)));
      card.append(h('div', { class: 'stats' }, ...tiles));
      card.append(barChart({ days, values: vals, color: t.color, yMax: t.type === 'rating' ? 5 : undefined, goal: t.goal, label: `${t.name} per day` }));
      if (t.goal) {
        const hit = vals.filter((v) => v !== null && v >= t.goal).length;
        card.append(h('p', { class: 'muted small' }, `Goal reached on ${hit} of ${s.n} logged days.`));
      }
      if (s.n >= 7) {
        card.append(h('h3', {}, 'By weekday'));
        card.append(weekdayChart({ values: byWeekday(days, vals), color: t.color, yMax: t.type === 'rating' ? 5 : undefined, label: `${t.name} by weekday` }));
      }
    }
    return card;
  });

  const rels = correlations(state, days);
  const relCard = state.trackers.length >= 2 ? h('article', { class: 'card' },
    h('h2', {}, 'Connections'),
    rels.length
      ? h('ul', { class: 'rels' }, ...rels.slice(0, 6).map(({ a, b, r, n }) => h('li', {},
        h('span', { class: `badge ${r > 0 ? 'pos' : 'neg'}` }, r > 0 ? '↗' : '↘'),
        h('span', {}, `${describe(a)} tends to come with ${r > 0 ? 'higher' : 'lower'} ${b.name.toLowerCase()}`,
          h('span', { class: 'muted small' }, ` · ${strength(r)}, ${n} days`)))))
      : h('p', { class: 'muted' }, 'Keep logging. Once two trackers share about a week of data, patterns between them show up here.'),
    h('p', { class: 'muted small' }, 'Patterns, not proof: two things moving together doesn’t mean one causes the other.')) : null;

  return h('section', {}, h('h1', {}, 'Insights'), chips, ...cards, relCard);
}

function describe(t) {
  return t.type === 'check' ? `Doing ${t.name.toLowerCase()}` : `Higher ${t.name.toLowerCase()}`;
}
function strength(r) {
  const a = Math.abs(r);
  return a >= 0.7 ? 'strong' : a >= 0.5 ? 'moderate' : 'weak';
}

function viewHistory() {
  const sel = h('select', { 'aria-label': 'Filter by tracker', onchange: (e) => { historyFilter = e.target.value; historyLimit = 100; render(); } },
    h('option', { value: '' }, 'All trackers'),
    ...state.trackers.map((t) => h('option', { value: t.id, selected: t.id === historyFilter }, t.name)));
  const list = state.entries
    .filter((e) => !historyFilter || e.trackerId === historyFilter)
    .sort((a, b) => b.day.localeCompare(a.day) || b.ts - a.ts);
  if (!list.length) return h('section', {}, h('h1', {}, 'History'), sel, h('p', { class: 'muted card' }, 'No entries yet.'));

  const groups = [];
  for (const e of list.slice(0, historyLimit)) {
    if (!groups.length || groups.at(-1).day !== e.day) groups.push({ day: e.day, items: [] });
    groups.at(-1).items.push(e);
  }
  return h('section', {}, h('h1', {}, 'History'), sel,
    ...groups.map((g) => h('div', { class: 'card hist' },
      h('h3', {}, dayLabel(g.day)),
      h('ul', {}, ...g.items.map((e) => {
        const t = tracker(e.trackerId);
        return h('li', { css: { '--c': t.color } },
          h('span', { class: 'dot' }),
          h('span', { class: 'grow' }, t.name),
          h('span', { class: 'value' }, formatValue(t, e.value)),
          h('span', { class: 'muted small' }, new Date(e.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })),
          h('button', {
            class: 'icon-btn small', 'aria-label': `Delete ${t.name} entry`,
            onclick: async () => {
              if (!await confirmDialog('Delete entry?', `${t.name}: ${formatValue(t, e.value)} on ${dayLabel(e.day)}`, 'Delete', true)) return;
              state.entries = state.entries.filter((x) => x !== e);
              await commit();
            },
          }, '✕'));
      })))),
    list.length > historyLimit ? h('button', { class: 'btn ghost wide', onclick: () => { historyLimit += 200; render(); } }, 'Show more') : null);
}

async function download(name, text, type) {
  // Android app: hand the file to the system "Save to…" picker.
  if (globalThis.PocketStatsAndroid?.save) {
    globalThis.PocketStatsAndroid.save(name, type, text);
    return;
  }
  // Inside the claude.ai web-link version, files go through the viewer's save prompt.
  const saver = globalThis.claude?.use ? await globalThis.claude.use('downloads').catch(() => null) : null;
  if (saver) {
    try {
      await saver.save({ filename: name, data: text });
      toast('Saved');
    } catch (err) {
      if (err?.code !== 'declined') toast("Couldn't save the file here.");
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv() {
  if (!await confirmDialog('Export CSV?', 'CSV files are NOT encrypted. Anyone who gets the file can read it. Keep it somewhere private and delete it when you are done.', 'Export')) return;
  const rows = [['date', 'time', 'tracker', 'type', 'value', 'unit']];
  for (const e of [...state.entries].sort((a, b) => a.ts - b.ts)) {
    const t = tracker(e.trackerId);
    rows.push([e.day, new Date(e.ts).toTimeString().slice(0, 5), t.name, t.type, e.value, t.unit]);
  }
  download(`pocket-stats-${dayKey()}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}

async function exportBackup() {
  if (!vault.hasPasscode() && !await confirmDialog('Export unencrypted backup?', 'You have no passcode set, so this backup will be readable by anyone who gets the file. Set a passcode first to get an encrypted backup.', 'Export anyway')) return;
  const data = await vault.exportBackup(state);
  download(`pocket-stats-backup-${dayKey()}.json`, JSON.stringify(data), 'application/json');
}

function importBackup() {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      let pass;
      if (obj?.encrypted) {
        pass = await passcodeDialog('Backup passcode', { hint: 'Enter the passcode that was set when this backup was made.' });
        if (!pass) return;
      }
      let data;
      try { data = await vault.readBackup(obj, pass); } catch (err) {
        toast(err.message.includes('Pocket Stats') ? err.message : 'Wrong passcode or damaged file.');
        return;
      }
      const next = normalize(data);
      if (!await confirmDialog('Replace current data?', `The backup has ${next.trackers.length} trackers and ${next.entries.length} entries. Everything currently in the app will be replaced.`, 'Replace', true)) return;
      state = next;
      await attachPhotos();
      await commit();
      toast('Backup restored');
    } catch {
      toast("That file couldn't be read.");
    }
  });
  input.click();
}

async function setPasscode() {
  if (!vault.cryptoAvailable()) { toast('Encryption needs the app to be opened over https.'); return; }
  if (vault.hasPasscode()) {
    const cur = await passcodeDialog('Current passcode');
    if (!cur) return;
    if (!await vault.verify(cur)) { toast('Wrong passcode'); return; }
  }
  const pass = await passcodeDialog(vault.hasPasscode() ? 'New passcode' : 'Set a passcode', {
    confirm: true,
    hint: 'Your data will be encrypted with this. There is no recovery: if you forget it, the only option is to erase everything.',
  });
  if (!pass) return;
  toast('Encrypting…');
  await vault.setPasscode(pass, state);
  toast('Passcode set. Data encrypted.');
  render();
}

async function removePasscode() {
  const cur = await passcodeDialog('Current passcode', { hint: 'Removing the passcode stores your data unencrypted on this phone.' });
  if (!cur) return;
  if (!await vault.verify(cur)) { toast('Wrong passcode'); return; }
  await vault.removePasscode(state);
  toast('Passcode removed');
  render();
}

async function eraseAll() {
  if (!await confirmDialog('Erase everything?', 'All trackers and entries will be permanently deleted from this phone. This cannot be undone.', 'Erase', true)) return;
  await vault.wipe();
  state = freshState();
  await vault.save(state);
  curDay = dayKey();
  view = 'today';
  toast('All data erased');
  render();
}

function moveTracker(i, d) {
  const j = i + d;
  if (j < 0 || j >= state.trackers.length) return;
  [state.trackers[i], state.trackers[j]] = [state.trackers[j], state.trackers[i]];
  commit();
}

async function deleteTracker(t) {
  const n = state.entries.filter((e) => e.trackerId === t.id).length;
  if (!await confirmDialog(`Delete ${t.name}?`, n ? `This also deletes its ${n} entries.` : null, 'Delete', true)) return;
  state.trackers = state.trackers.filter((x) => x !== t);
  state.entries = state.entries.filter((e) => e.trackerId !== t.id);
  if (historyFilter === t.id) historyFilter = '';
  await commit();
}

function viewSettings() {
  const locked = vault.hasPasscode();
  const autoLock = h('select', {
    'aria-label': 'Auto-lock',
    onchange: (e) => { state.settings.autoLock = +e.target.value; commit(); },
  }, ...[[0, 'Immediately'], [1, 'After 1 minute'], [5, 'After 5 minutes'], [15, 'After 15 minutes'], [-1, 'Never']]
    .map(([v, l]) => h('option', { value: v, selected: state.settings.autoLock === v }, l)));

  const persist = h('span', { class: 'muted small' }, 'Checking…');
  navigator.storage?.persisted?.().then((p) => {
    persist.textContent = p ? 'Protected from automatic cleanup' : 'The browser may clear it if storage runs low. Add the app to your home screen to keep it safe.';
  }).catch(() => { persist.textContent = ''; });

  return h('section', {}, h('h1', {}, 'Settings'),
    h('article', { class: 'card' },
      h('h2', {}, 'Trackers'),
      state.trackers.length ? h('ul', { class: 'manage' }, ...state.trackers.map((t, i) => h('li', { css: { '--c': t.color } },
        h('span', { class: 'dot' }),
        h('span', { class: 'grow' }, t.name, h('span', { class: 'muted small' }, ` · ${TYPES[t.type]}`)),
        h('button', { class: 'icon-btn small', 'aria-label': `Move ${t.name} up`, disabled: i === 0, onclick: () => moveTracker(i, -1) }, '↑'),
        h('button', { class: 'icon-btn small', 'aria-label': `Move ${t.name} down`, disabled: i === state.trackers.length - 1, onclick: () => moveTracker(i, 1) }, '↓'),
        h('button', { class: 'icon-btn small', 'aria-label': `Edit ${t.name}`, onclick: () => editTracker(t) }, '✎'),
        h('button', { class: 'icon-btn small', 'aria-label': `Delete ${t.name}`, onclick: () => deleteTracker(t) }, '✕'))))
        : h('p', { class: 'muted' }, 'No trackers yet.'),
      h('button', { class: 'btn ghost wide', onclick: addTracker }, '+ Add tracker')),

    h('article', { class: 'card' },
      h('h2', {}, 'Lock & encryption'),
      h('p', { class: locked ? 'ok' : 'muted' }, locked
        ? '🔒 Locked with a passcode. Your data is encrypted on this phone (AES-256).'
        : 'No passcode. Anyone holding your unlocked phone could open the app.'),
      locked ? h('label', { class: 'field' }, h('span', {}, 'Lock when I leave the app'), autoLock) : null,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: setPasscode }, locked ? 'Change passcode' : 'Set passcode'),
        locked ? h('button', { class: 'btn ghost', onclick: removePasscode }, 'Remove') : null,
        locked ? h('button', { class: 'btn ghost', onclick: lockNow }, 'Lock now') : null)),

    foodSettingsCard(foodCtx),

    h('article', { class: 'card' },
      h('h2', {}, 'Your data'),
      h('p', { class: 'muted small' }, `${state.trackers.length} trackers · ${state.entries.length} entries · ${state.food.log.length} foods logged · stored only on this phone`),
      h('p', {}, persist),
      globalThis.POCKET_STATS_HOSTED ? h('p', { class: 'warn small' }, 'You are using the web-link version. Your browser can clear its storage, so export a backup every week. You can restore it in any version of Pocket Stats.') : null,
      h('div', { class: 'stack' },
        h('button', { class: 'btn ghost', onclick: exportBackup }, locked ? 'Export encrypted backup' : 'Export backup'),
        h('button', { class: 'btn ghost', onclick: importBackup }, 'Restore from backup'),
        h('button', { class: 'btn ghost', onclick: exportCsv }, 'Export CSV (unencrypted)'),
        h('button', { class: 'btn danger', onclick: eraseAll }, 'Erase all data'))),

    h('article', { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('ul', { class: 'bullets' },
        h('li', {}, 'No accounts, no cloud, no servers. Data never leaves this phone unless you export it.'),
        h('li', {}, 'The app can only talk to the two food databases, and only after you allow it. Everything else is blocked. No ads, trackers or analytics.'),
        h('li', {}, 'Barcode scanning happens on the phone. Camera images are never saved or sent.'),
        h('li', {}, 'Works fully offline once opened.'),
        h('li', {}, 'With a passcode, data is encrypted at rest and hidden in the app switcher.'))),
    h('p', { class: 'muted small center' }, 'Pocket Stats v1.7'));
}

// Context handed to the Food tab so it can read and save shared state.
/**
 * Photos are stored outside the main record. Load them into memory, and move any that
 * are still inside it (from an older version or a restored backup) to their own records.
 */
async function attachPhotos() {
  const inline = state.food.myPhotos || {};
  const inlineScans = state.food.scans || {};
  const hasInline = Object.keys(inline).length > 0 || Object.keys(inlineScans).length > 0;
  if (hasInline) {
    await vault.savePhotos(inline);
    for (const [id, rec] of Object.entries(inlineScans)) await vault.saveScan(id, rec);
  }
  state.food.myPhotos = { ...inline, ...(await vault.loadPhotos()) };
  state.food.scans = { ...inlineScans, ...(await vault.loadScans()) };
  if (hasInline) await vault.save(state);
}

const foodCtx = {
  get state() { return state; },
  savePhoto: (id, url) => vault.savePhoto(id, url),
  saveScan: (id, rec) => vault.saveScan(id, rec),
  deleteScan: (id) => vault.deleteScan(id),
  commit: () => commit(),
  render: () => render(),
  save: () => vault.save(state).catch((err) => toast(`Couldn't save: ${err.message}`)),
};

// ---------- lock screen ----------
function lockNow() {
  vault.lock();
  state = null;
  showLock();
}

function showLock() {
  try { globalThis.PocketStatsAndroid?.setSecure?.(true); } catch { /* not in the Android app */ }
  $tabs.hidden = true;
  document.body.classList.remove('hide-content');
  const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passcode', 'aria-label': 'Passcode', autofocus: true });
  const err = h('p', { class: 'error', hidden: true });
  const btn = h('button', { class: 'btn primary wide', type: 'submit' }, 'Unlock');
  const form = h('form', {
    class: 'lock',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value) return;
      btn.disabled = true; btn.textContent = 'Unlocking…'; err.hidden = true;
      try {
        state = normalize(await vault.unlock(input.value));
        await attachPhotos();
        render();
        warmFoodDb();
      } catch {
        err.textContent = 'Wrong passcode.'; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Unlock';
        input.select();
      }
    },
  },
  h('div', { class: 'lock-icon', 'aria-hidden': 'true' }, '🔒'),
  h('h1', {}, 'Pocket Stats'),
  h('p', { class: 'muted' }, 'Enter your passcode'),
  input, err, btn,
  h('button', {
    type: 'button', class: 'link small',
    onclick: async () => {
      if (!await confirmDialog('Forgot your passcode?', 'There is no way to recover encrypted data without it. You can erase everything and start over.', 'Erase and start over', true)) return;
      await vault.wipe();
      state = freshState();
      await vault.save(state);
      render();
    },
  }, 'Forgot passcode?'));
  $app.replaceChildren(form);
  input.focus();
}

// ---------- shell ----------
const TABS = [
  ['today', 'Today', 'M4 6h16M4 12h16M4 18h10'],
  ['food', 'Food', 'M6 3v7a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-2.2 0-4 2.7-4 7v3h4'],
  ['gym', 'Gym', 'M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11'],
  ['insights', 'Insights', 'M5 20V11M12 20V4M19 20v-6'],
  ['settings', 'Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
];

function icon(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

function render() {
  // Android app: block screenshots and the app-switcher preview while a passcode is set.
  try { globalThis.PocketStatsAndroid?.setSecure?.(vault.hasPasscode()); } catch { /* not in the Android app */ }
  if (!state) return;
  const scroll = view === render.lastView ? window.scrollY : 0;
  render.lastView = view;
  const views = { today: viewToday, food: () => viewFood(foodCtx), gym: () => viewGym(foodCtx), insights: viewInsightsTab, settings: viewSettings };
  $app.replaceChildren(views[view]());
  $tabs.hidden = false;
  $tabs.replaceChildren(...TABS.map(([id, label, d]) => h('button', {
    class: `tab${id === view ? ' on' : ''}`, 'aria-current': id === view ? 'page' : null,
    onclick: () => { if (id !== view) { if (id === 'today') curDay = dayKey(); if (id === 'food') resetFoodView(); if (id === 'gym') resetGymView(); } view = id; render(); },
  }, icon(d), h('span', {}, label))));
  window.scrollTo(0, scroll);
}

document.addEventListener('visibilitychange', () => {
  if (!state || !vault.hasPasscode()) return;
  if (document.hidden) {
    hiddenAt = Date.now();
    document.body.classList.add('hide-content'); // keep the app-switcher snapshot blank
    if (state.settings.autoLock === 0) lockNow();
  } else {
    document.body.classList.remove('hide-content');
    const mins = state.settings.autoLock;
    if (mins >= 0 && Date.now() - hiddenAt >= mins * 60000) lockNow();
  }
});

async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !globalThis.POCKET_STATS_HOSTED && !globalThis.POCKET_STATS_BUNDLED) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  vault.requestPersistence();
  try {
    const res = await vault.load();
    if (res.locked) { showLock(); return; }
    state = normalize(res.state);
    if (!res.state) await vault.save(state);
    await attachPhotos();
    render();
    warmFoodDb();
  } catch (err) {
    $app.replaceChildren(h('div', { class: 'card' }, h('h2', {}, "Storage isn't available"),
      h('p', { class: 'muted' }, 'This browser is blocking local storage (private browsing mode can do this). Open the app in a normal tab or from your home screen.'),
      h('p', { class: 'muted small' }, String(err?.message || err))));
  }
}

boot();
