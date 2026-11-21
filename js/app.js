import * as vault from './db.js';
import {
  dayKey, parseDay, addDays, dayRange, dailyValue, series, summarize, streaks, byWeekday, correlations,
} from './stats.js';
import { barChart, heatmap, weekdayChart } from './charts.js';
import { h, uid, dayLabel, toast, modal, confirmDialog, langToggle, iconButton } from './ui.js';
import { t, tn, fmt, timeText, applyDocument, onLang, lang, setLang } from './i18n.js';
import { icon } from './icons.js';
import { viewFood, freshFood, normalizeFood, foodSettingsCard, resetFoodView, mealSettingsCard, importStarterPhotos } from './food.js';
import { viewGym, freshGym, normalizeGym, resetGymView } from './gym.js';
import { loadFoodDb } from './fooddb.js';

/** Load the Moroccan food list (built into the Android app, or from the data server). */
function warmFoodDb() {
  if (state?.food?.moroccoDb === false) return;
  loadFoodDb().then(() => { if (view === 'settings' || view === 'food') render(); }).catch(() => { /* offline: try again next launch */ });
}

const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');

const COLORS = ['#4ADE9A', '#6CB4FF', '#F2B544', '#C9A0FF', '#FF8A7A', '#5FD4D4', '#B5D86A', '#A3B1AB'];
const TYPES = ['number', 'rating', 'check'];
const STARTERS = [
  { starter: 'mood', name: 'Mood', type: 'rating', color: '#C9A0FF' },
  { starter: 'sleep', name: 'Sleep', type: 'number', unit: 'h', agg: 'last', goal: 8, color: '#6CB4FF' },
  { starter: 'water', name: 'Water', type: 'number', unit: 'glasses', agg: 'sum', goal: 8, color: '#5FD4D4' },
  { starter: 'exercise', name: 'Exercise', type: 'check', color: '#4ADE9A' },
  { starter: 'spending', name: 'Spending', type: 'number', unit: 'dh', agg: 'sum', color: '#F2B544' },
];
const STARTER_NAMES = { mood: 'Mood', sleep: 'Sleep', water: 'Water', exercise: 'Exercise', spending: 'Spending', weight: 'Weight' };
const KNOWN_UNITS = ['h', 'glasses', 'dh', 'kg', 'lb', 'km', 'steps', 'cups', 'min', 'ml', 'g', 'kcal'];

let state = null;
let view = 'today';
let curDay = dayKey();
let range = 30;
let historyFilter = '';
let historyLimit = 100;
let hiddenAt = 0;

// ---------- names in your language ----------
/** A starter tracker keeps its translated name until you rename it. */
export function trackerName(tr) {
  return tr.starter && tr.name === STARTER_NAMES[tr.starter] ? t(`tracker.${tr.starter}`) : tr.name;
}
const unitName = (u) => (KNOWN_UNITS.includes(u) ? t(`unit.${u}`) : u);

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
  const byName = Object.fromEntries(Object.entries(STARTER_NAMES).map(([k, v]) => [v.toLowerCase(), k]));
  for (const tr of Array.isArray(raw.trackers) ? raw.trackers : []) {
    if (!tr || !tr.id || ids.has(String(tr.id))) continue;
    const type = TYPES.includes(tr.type) ? tr.type : 'number';
    ids.add(String(tr.id));
    const name = str(tr.name) || 'Untitled';
    const starter = STARTER_NAMES[tr.starter] ? tr.starter : byName[name.toLowerCase()] || null;
    out.trackers.push({
      id: str(tr.id, 40),
      name: starter && name.toLowerCase() === STARTER_NAMES[starter].toLowerCase() ? STARTER_NAMES[starter] : name,
      starter,
      type,
      unit: type === 'number' ? str(tr.unit, 16) : '',
      agg: ['sum', 'avg', 'last'].includes(tr.agg) ? tr.agg : 'sum',
      goal: Number.isFinite(+tr.goal) && +tr.goal > 0 && type === 'number' ? +tr.goal : null,
      color: /^#[0-9a-f]{6}$/i.test(tr.color) ? tr.color : COLORS[0],
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
    toast(t('err.save', { msg: err.message }));
  }
  render();
}

const tracker = (id) => state.trackers.find((x) => x.id === id);

function formatValue(tr, v) {
  if (v === null || v === undefined) return '—';
  if (tr.type === 'check') return v ? t('done') : '—';
  if (tr.type === 'rating') return `${fmt(v, 1)} / 5`;
  return tr.unit ? `${fmt(v, 2)} ${unitName(tr.unit)}` : fmt(v, 2);
}

function passcodeDialog(title, { confirm = false, hint } = {}) {
  return modal((done) => {
    const p1 = h('input', { type: 'password', autocomplete: 'off', autofocus: true, required: true, minlength: 4, placeholder: t('lock.passcode'), 'aria-label': t('lock.passcode') });
    const p2 = confirm ? h('input', { type: 'password', autocomplete: 'off', required: true, placeholder: t('lock.repeat'), 'aria-label': t('lock.repeat') }) : null;
    const err = h('p', { class: 'error', hidden: true });
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        if (p1.value.length < 4) { err.textContent = t('lock.tooShort'); err.hidden = false; return; }
        if (p2 && p1.value !== p2.value) { err.textContent = t('lock.noMatch'); err.hidden = false; return; }
        done(p1.value);
      },
    },
    h('h2', {}, title),
    hint ? h('p', { class: 'muted' }, hint) : null,
    h('label', { class: 'field' }, p1),
    p2 ? h('label', { class: 'field' }, p2) : null,
    err,
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, t('cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('continue'))));
  });
}

function trackerDialog(existing) {
  const tr = existing ? { ...existing, name: trackerName(existing) } : { name: '', type: 'number', unit: '', agg: 'sum', goal: null, color: COLORS[state.trackers.length % COLORS.length] };
  return modal((done) => {
    const name = h('input', { value: tr.name, maxlength: 60, required: true, autofocus: !existing, placeholder: t('tr.namePh') });
    const type = h('select', {}, ...TYPES.map((k) => h('option', { value: k, selected: k === tr.type }, t(`tr.type.${k}`))));
    const unit = h('input', { value: tr.unit, maxlength: 16, placeholder: t('tr.unitPh') });
    const agg = h('select', {},
      ...['sum', 'avg', 'last'].map((k) => h('option', { value: k, selected: tr.agg === k }, t(`tr.agg.${k}`))));
    const goal = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, value: tr.goal ?? '', placeholder: t('optional') });
    let color = tr.color;
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('tr.color') });
    const paint = () => {
      swatches.replaceChildren(...COLORS.map((c, i) => h('button', {
        type: 'button', class: `swatch${c === color ? ' on' : ''}`, css: { '--c': c }, role: 'radio', 'aria-checked': String(c === color), 'aria-label': t('tr.colorN', { n: i + 1 }),
        onclick: () => { color = c; paint(); },
      })));
    };
    paint();
    const numberOnly = h('div', { class: 'stack' },
      h('label', { class: 'field' }, h('span', {}, t('tr.unit')), unit),
      h('label', { class: 'field' }, h('span', {}, t('tr.agg')), agg),
      h('label', { class: 'field' }, h('span', {}, t('tr.goal')), goal));
    const sync = () => { numberOnly.hidden = type.value !== 'number'; };
    type.addEventListener('change', sync);
    sync();
    return h('form', {
      class: 'sheet-body',
      onsubmit: (e) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        const keepStarter = existing?.starter && name.value.trim() === trackerName(existing);
        done({
          ...tr,
          id: tr.id || uid(),
          name: keepStarter ? existing.name : name.value.trim(),
          starter: keepStarter ? existing.starter : null,
          type: type.value,
          unit: type.value === 'number' ? unit.value.trim() : '',
          agg: agg.value,
          goal: type.value === 'number' && +goal.value > 0 ? +goal.value : null,
          color,
        });
      },
    },
    h('h2', {}, existing ? t('tr.edit') : t('tr.new')),
    h('label', { class: 'field' }, h('span', {}, t('tr.name')), name),
    h('label', { class: 'field' }, h('span', {}, t('tr.type')), type),
    numberOnly,
    h('div', { class: 'field' }, h('span', {}, t('tr.color')), swatches),
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, t('cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, existing ? t('save') : t('tr.add'))));
  });
}

async function addTracker() {
  const tr = await trackerDialog(null);
  if (!tr) return;
  state.trackers.push(tr);
  await commit();
}

async function editTracker(tr) {
  const next = await trackerDialog(tr);
  if (!next) return;
  if (next.type !== tr.type && state.entries.some((e) => e.trackerId === tr.id)) {
    const ok = await confirmDialog(t('tr.changeType'), t('tr.changeTypeBody', { name: trackerName(tr) }), t('tr.change'));
    if (!ok) return;
  }
  Object.assign(tr, next);
  await commit();
}

// ---------- logging ----------
function log(tr, value) {
  const ts = curDay === dayKey() ? Date.now() : parseDay(curDay).getTime() + 12 * 3600 * 1000;
  state.entries.push({ id: uid(), trackerId: tr.id, day: curDay, value, ts });
}

const dayEntries = (tr) => state.entries.filter((e) => e.trackerId === tr.id && e.day === curDay);

async function toggleCheck(tr) {
  const existing = dayEntries(tr);
  if (existing.length) state.entries = state.entries.filter((e) => !existing.includes(e));
  else log(tr, 1);
  await commit();
}

async function setRating(tr, v) {
  const existing = dayEntries(tr);
  const same = existing.length === 1 && existing[0].value === v;
  state.entries = state.entries.filter((e) => !existing.includes(e));
  if (!same) log(tr, v);
  await commit();
}

async function addNumber(tr, input) {
  const v = parseFloat(String(input.value).replace(',', '.'));
  if (!Number.isFinite(v)) { input.focus(); return; }
  if (tr.agg === 'last') state.entries = state.entries.filter((e) => !(e.trackerId === tr.id && e.day === curDay));
  log(tr, v);
  await commit();
  toast(t('tr.logged', { name: trackerName(tr), value: formatValue(tr, v) }));
}

async function undoLast(tr) {
  const list = dayEntries(tr).sort((a, b) => b.ts - a.ts);
  if (!list.length) return;
  state.entries = state.entries.filter((e) => e !== list[0]);
  await commit();
  toast(t('tr.removedLast'));
}

// ---------- views ----------
function pageHead(title, sub = null) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'grow-wrap' }, sub ? h('span', { class: 'date' }, sub) : null, h('h1', {}, title)),
    langToggle(render));
}

function viewToday() {
  const today = dayKey();
  const head = h('header', { class: 'day-nav' },
    iconButton('back', t('day.prev'), () => { curDay = addDays(curDay, -1); render(); }),
    h('div', { class: 'day-title' },
      h('h1', {}, dayLabel(curDay)),
      curDay !== today ? h('button', { class: 'link small', onclick: () => { curDay = today; render(); } }, t('day.backToToday')) : null),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('day.next'), disabled: curDay >= today, onclick: () => { curDay = addDays(curDay, 1); render(); } }, icon('next')),
      langToggle(render)));

  if (!state.trackers.length) {
    const picked = new Set();
    const addBtn = h('button', {
      class: 'btn primary wide', disabled: true,
      onclick: async () => {
        for (const s of STARTERS.filter((x) => picked.has(x.starter))) {
          state.trackers.push({ ...s, id: uid(), unit: s.unit || '', agg: s.agg || 'sum', goal: s.goal || null });
        }
        await commit();
      },
    }, t('tr.addSelected'));
    return h('section', {}, head,
      h('div', { class: 'card empty' },
        h('h2', {}, t('tr.whatTrack')),
        h('p', { class: 'muted' }, t('tr.pickFew')),
        h('div', { class: 'chips' }, ...STARTERS.map((s) => h('button', {
          class: 'chip', 'aria-pressed': 'false',
          onclick: (e) => {
            if (picked.has(s.starter)) picked.delete(s.starter); else picked.add(s.starter);
            const on = picked.has(s.starter);
            e.currentTarget.classList.toggle('on', on);
            e.currentTarget.setAttribute('aria-pressed', String(on));
            addBtn.disabled = !picked.size;
            addBtn.textContent = picked.size ? tn('tr.addN', picked.size) : t('tr.addSelected');
          },
        }, t(`tracker.${s.starter}`)))),
        addBtn,
        h('button', { class: 'btn ghost wide', onclick: addTracker }, t('tr.custom'))));
  }

  const cards = state.trackers.map((tr) => {
    const entries = dayEntries(tr);
    const v = dailyValue(tr, entries);
    const card = h('article', { class: 'card tracker', css: { '--c': tr.color } });
    card.append(h('div', { class: 'tracker-head' },
      h('span', { class: 'dot' }),
      h('h2', {}, trackerName(tr)),
      h('span', { class: 'value' }, tr.type === 'check' ? '' : formatValue(tr, v))));

    if (tr.type === 'check') {
      const { current } = streaks(state, tr, today);
      card.append(h('div', { class: 'row' },
        h('button', { class: `toggle${v ? ' on' : ''}`, 'aria-pressed': String(!!v), onclick: () => toggleCheck(tr) }, v ? [icon('check', 'icon-sm'), t('done')] : t('tr.markDone')),
        current ? h('span', { class: 'muted small row' }, icon('flame', 'icon-sm'), tn('tr.streak', current)) : null));
    } else if (tr.type === 'rating') {
      card.append(h('div', { class: 'rating', role: 'group', 'aria-label': t('tr.ratingOf', { name: trackerName(tr) }) },
        ...[1, 2, 3, 4, 5].map((n) => h('button', {
          class: `rate${v === n ? ' on' : ''}`, 'aria-pressed': String(v === n), onclick: () => setRating(tr, n),
        }, String(n)))));
    } else {
      const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: tr.unit ? unitName(tr.unit) : t('tr.value'), 'aria-label': t('tr.valueOf', { name: trackerName(tr) }), enterkeyhint: 'done' });
      const form = h('form', { class: 'row log', onsubmit: (e) => { e.preventDefault(); addNumber(tr, input); } },
        input,
        h('button', { class: 'btn primary', type: 'submit' }, tr.agg === 'sum' ? t('add') : t('log')),
        entries.length ? h('button', { class: 'btn ghost', type: 'button', 'aria-label': t('tr.undoLast'), onclick: () => undoLast(tr) }, t('undo')) : null);
      if (tr.goal) {
        const pct = Math.min(1, (v || 0) / tr.goal);
        card.append(h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round(pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
          h('div', { css: { width: `${pct * 100}%` } })),
        h('p', { class: 'muted small' }, pct >= 1 ? t('tr.goalReached', { goal: formatValue(tr, tr.goal) }) : t('tr.goalIs', { goal: formatValue(tr, tr.goal) })));
      }
      card.append(form);
    }
    return card;
  });

  return h('section', {}, head, ...cards,
    h('button', { class: 'btn ghost wide', onclick: addTracker }, icon('plus', 'icon-sm'), t('tr.addTracker')));
}

function statTile(label, value) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));
}

function trendText(tr, s) {
  if (s.trend === undefined || Math.abs(s.trend) < 1e-9) return t('ins.steady');
  const arrow = s.trend > 0 ? '↑' : '↓';
  if (s.trendPct !== null && Number.isFinite(s.trendPct)) return `${arrow} ${fmt(Math.abs(s.trendPct) * 100)}%`;
  return `${arrow} ${fmt(Math.abs(s.trend), 1)}`;
}

let insightsSub = 'charts';

function viewInsightsTab() {
  const sw = h('div', { class: 'chips seg', role: 'tablist' }, ...[['charts', t('ins.charts')], ['history', t('ins.history')]].map(([k, l]) => h('button', {
    class: `chip${k === insightsSub ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === insightsSub), onclick: () => { insightsSub = k; render(); },
  }, l)));
  const sec = insightsSub === 'history' ? viewHistory() : viewInsights();
  sec.prepend(pageHead(insightsSub === 'history' ? t('ins.history') : t('tab.insights')), sw);
  return sec;
}

function viewInsights() {
  const today = dayKey();
  const days = dayRange(today, range);
  const chips = h('div', { class: 'chips seg', role: 'tablist' }, ...[7, 30, 90, 365].map((n) => h('button', {
    class: `chip${n === range ? ' on' : ''}`, role: 'tab', 'aria-selected': String(n === range), onclick: () => { range = n; render(); },
  }, t(`ins.range.${n}`))));

  if (!state.trackers.length) return h('section', {}, h('p', { class: 'muted card' }, t('ins.empty')));

  const cards = state.trackers.map((tr) => {
    const vals = series(state, tr, days);
    const s = summarize(tr, vals);
    const name = trackerName(tr);
    const card = h('article', { class: 'card', css: { '--c': tr.color } },
      h('div', { class: 'tracker-head' }, h('span', { class: 'dot' }), h('h2', {}, name), h('span', { class: 'muted small' }, t('ins.daysOf', { n: fmt(s.n), d: fmt(s.days) }))));
    if (!s.n) {
      card.append(h('p', { class: 'muted' }, t('ins.nothing')));
      return card;
    }
    if (tr.type === 'check') {
      const st = streaks(state, tr, today);
      card.append(h('div', { class: 'stats' },
        statTile(t('done'), `${fmt(s.rate * 100)}%`),
        statTile(t('ins.streak'), t('ins.nDays', { n: fmt(st.current) })),
        statTile(t('ins.best'), t('ins.nDays', { n: fmt(st.best) }))));
      card.append(heatmap({ days, values: vals, color: tr.color, label: t('ins.calendarOf', { name }) }));
    } else {
      const isSum = tr.type === 'number' && tr.agg === 'sum';
      const tiles = [statTile(isSum ? t('ins.dailyAvg') : t('ins.average'), formatValue(tr, s.mean))];
      if (isSum) tiles.push(statTile(t('ins.total'), formatValue(tr, s.total)));
      else tiles.push(statTile(t('ins.range'), `${fmt(s.min, 1)}–${fmt(s.max, 1)}`));
      tiles.push(statTile(t('ins.trend'), trendText(tr, s)));
      card.append(h('div', { class: 'stats' }, ...tiles));
      card.append(barChart({ days, values: vals, color: tr.color, yMax: tr.type === 'rating' ? 5 : undefined, goal: tr.goal, label: t('ins.perDay', { name }) }));
      if (tr.goal) {
        const hit = vals.filter((v) => v !== null && v >= tr.goal).length;
        card.append(h('p', { class: 'muted small' }, t('ins.goalHit', { hit: fmt(hit), n: fmt(s.n) })));
      }
      if (s.n >= 7) {
        card.append(h('h3', {}, t('ins.byWeekday')));
        card.append(weekdayChart({ values: byWeekday(days, vals), color: tr.color, yMax: tr.type === 'rating' ? 5 : undefined, label: t('ins.byWeekdayOf', { name }) }));
      }
    }
    return card;
  });

  const rels = correlations(state, days);
  const relCard = state.trackers.length >= 2 ? h('article', { class: 'card' },
    h('h2', {}, t('ins.connections')),
    rels.length
      ? h('ul', { class: 'rels' }, ...rels.slice(0, 6).map(({ a, b, r, n }) => h('li', {},
        h('span', { class: `badge ${r > 0 ? 'pos' : 'neg'}`, 'aria-hidden': 'true' }, r > 0 ? '↗' : '↘'),
        h('span', {}, t(r > 0 ? 'ins.relHigher' : 'ins.relLower', { a: describe(a), b: trackerName(b) }),
          h('span', { class: 'muted small' }, ` · ${t(`ins.strength.${strength(r)}`)}, ${tn('ins.nDaysP', n)}`))))) : h('p', { class: 'muted' }, t('ins.keepLogging')),
    h('p', { class: 'muted small' }, t('ins.notProof'))) : null;

  return h('section', {}, chips, ...cards, relCard);
}

function describe(tr) {
  return t(tr.type === 'check' ? 'ins.doing' : 'ins.higher', { name: trackerName(tr) });
}
function strength(r) {
  const a = Math.abs(r);
  return a >= 0.7 ? 'strong' : a >= 0.5 ? 'moderate' : 'weak';
}

function viewHistory() {
  const sel = h('select', { 'aria-label': t('ins.filter'), onchange: (e) => { historyFilter = e.target.value; historyLimit = 100; render(); } },
    h('option', { value: '' }, t('ins.allTrackers')),
    ...state.trackers.map((tr) => h('option', { value: tr.id, selected: tr.id === historyFilter }, trackerName(tr))));
  const list = state.entries
    .filter((e) => !historyFilter || e.trackerId === historyFilter)
    .sort((a, b) => b.day.localeCompare(a.day) || b.ts - a.ts);
  if (!list.length) return h('section', {}, sel, h('p', { class: 'muted card' }, t('ins.noEntries')));

  const groups = [];
  for (const e of list.slice(0, historyLimit)) {
    if (!groups.length || groups.at(-1).day !== e.day) groups.push({ day: e.day, items: [] });
    groups.at(-1).items.push(e);
  }
  return h('section', {}, sel,
    ...groups.map((g) => h('div', { class: 'card hist' },
      h('h3', {}, dayLabel(g.day)),
      h('ul', {}, ...g.items.map((e) => {
        const tr = tracker(e.trackerId);
        const name = trackerName(tr);
        return h('li', { css: { '--c': tr.color } },
          h('span', { class: 'dot' }),
          h('span', { class: 'grow' }, name),
          h('span', { class: 'value' }, formatValue(tr, e.value)),
          h('span', { class: 'muted small num' }, timeText(new Date(e.ts))),
          h('button', {
            class: 'icon-btn small', 'aria-label': t('ins.deleteEntry', { name }),
            onclick: async () => {
              if (!await confirmDialog(t('ins.deleteQ'), t('ins.deleteBody', { name, value: formatValue(tr, e.value), day: dayLabel(e.day) }), t('delete'), true)) return;
              state.entries = state.entries.filter((x) => x !== e);
              await commit();
            },
          }, icon('close', 'icon-sm')));
      })))),
    list.length > historyLimit ? h('button', { class: 'btn ghost wide', onclick: () => { historyLimit += 200; render(); } }, t('showMore')) : null);
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
      toast(t('saved'));
    } catch (err) {
      if (err?.code !== 'declined') toast(t('err.saveFile'));
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
  if (!await confirmDialog(t('set.csvQ'), t('set.csvBody'), t('set.export'))) return;
  const rows = [['date', 'time', 'tracker', 'type', 'value', 'unit']];
  for (const e of [...state.entries].sort((a, b) => a.ts - b.ts)) {
    const tr = tracker(e.trackerId);
    rows.push([e.day, new Date(e.ts).toTimeString().slice(0, 5), tr.name, tr.type, e.value, tr.unit]);
  }
  download(`pocket-stats-${dayKey()}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}

async function exportBackup() {
  if (!vault.hasPasscode() && !await confirmDialog(t('set.plainBackupQ'), t('set.plainBackupBody'), t('set.exportAnyway'))) return;
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
        pass = await passcodeDialog(t('set.backupPass'), { hint: t('set.backupPassHint') });
        if (!pass) return;
      }
      let data;
      try { data = await vault.readBackup(obj, pass); } catch (err) {
        toast(err.message === 'not-a-backup' ? t('set.notBackup') : t('set.wrongPass'));
        return;
      }
      const next = normalize(data);
      if (!await confirmDialog(t('set.replaceQ'), t('set.replaceBody', { tr: fmt(next.trackers.length), en: fmt(next.entries.length) }), t('set.replace'), true)) return;
      state = next;
      await attachPhotos();
      await commit();
      toast(t('set.restored'));
    } catch {
      toast(t('set.unreadable'));
    }
  });
  input.click();
}

async function setPasscode() {
  if (!vault.cryptoAvailable()) { toast(t('lock.needHttps')); return; }
  if (vault.hasPasscode()) {
    const cur = await passcodeDialog(t('lock.current'));
    if (!cur) return;
    if (!await vault.verify(cur)) { toast(t('lock.wrong')); return; }
  }
  const pass = await passcodeDialog(vault.hasPasscode() ? t('lock.newPass') : t('lock.setPass'), { confirm: true, hint: t('lock.noRecovery') });
  if (!pass) return;
  toast(t('lock.encrypting'));
  await vault.setPasscode(pass, state);
  toast(t('lock.setDone'));
  render();
}

async function removePasscode() {
  const cur = await passcodeDialog(t('lock.current'), { hint: t('lock.removeHint') });
  if (!cur) return;
  if (!await vault.verify(cur)) { toast(t('lock.wrong')); return; }
  await vault.removePasscode(state);
  toast(t('lock.removed'));
  render();
}

async function eraseAll() {
  if (!await confirmDialog(t('set.eraseQ'), t('set.eraseBody'), t('set.erase'), true)) return;
  await vault.wipe();
  state = freshState();
  await vault.save(state);
  curDay = dayKey();
  view = 'today';
  toast(t('set.erased'));
  render();
}

function moveTracker(i, d) {
  const j = i + d;
  if (j < 0 || j >= state.trackers.length) return;
  [state.trackers[i], state.trackers[j]] = [state.trackers[j], state.trackers[i]];
  commit();
}

async function deleteTracker(tr) {
  const n = state.entries.filter((e) => e.trackerId === tr.id).length;
  if (!await confirmDialog(t('tr.deleteQ', { name: trackerName(tr) }), n ? tn('tr.deleteBody', n) : null, t('delete'), true)) return;
  state.trackers = state.trackers.filter((x) => x !== tr);
  state.entries = state.entries.filter((e) => e.trackerId !== tr.id);
  if (historyFilter === tr.id) historyFilter = '';
  await commit();
}

function viewSettings() {
  const locked = vault.hasPasscode();
  const autoLock = h('select', {
    'aria-label': t('set.autoLock'),
    onchange: (e) => { state.settings.autoLock = +e.target.value; commit(); },
  }, ...[0, 1, 5, 15, -1].map((v) => h('option', { value: v, selected: state.settings.autoLock === v }, t(`set.lock.${v}`))));

  const persist = h('span', { class: 'muted small' }, t('set.checking'));
  navigator.storage?.persisted?.().then((p) => {
    persist.textContent = p ? t('set.persisted') : t('set.notPersisted');
  }).catch(() => { persist.textContent = ''; });

  return h('section', {}, pageHead(t('tab.settings')),
    h('article', { class: 'card' },
      h('h2', {}, t('set.language')),
      h('div', { class: 'chips seg', role: 'radiogroup', 'aria-label': t('set.language') },
        ...[['en', 'English'], ['ar', 'العربية']].map(([k, l]) => h('button', {
          type: 'button', class: `chip${lang() === k ? ' on' : ''}`, role: 'radio', 'aria-checked': String(lang() === k), lang: k,
          onclick: () => { setLang(k); render(); },
        }, l))),
      h('p', { class: 'muted small' }, t('set.languageHint'))),

    h('article', { class: 'card' },
      h('h2', {}, t('set.trackers')),
      state.trackers.length ? h('ul', { class: 'manage' }, ...state.trackers.map((tr, i) => h('li', { css: { '--c': tr.color } },
        h('span', { class: 'dot' }),
        h('span', { class: 'grow' }, trackerName(tr), h('span', { class: 'muted small' }, ` · ${t(`tr.type.${tr.type}`)}`)),
        h('button', { class: 'icon-btn small', 'aria-label': t('tr.moveUp', { name: trackerName(tr) }), disabled: i === 0, onclick: () => moveTracker(i, -1) }, icon('up', 'icon-sm')),
        h('button', { class: 'icon-btn small', 'aria-label': t('tr.moveDown', { name: trackerName(tr) }), disabled: i === state.trackers.length - 1, onclick: () => moveTracker(i, 1) }, icon('down', 'icon-sm')),
        h('button', { class: 'icon-btn small', 'aria-label': t('tr.editN', { name: trackerName(tr) }), onclick: () => editTracker(tr) }, icon('edit', 'icon-sm')),
        h('button', { class: 'icon-btn small', 'aria-label': t('tr.deleteN', { name: trackerName(tr) }), onclick: () => deleteTracker(tr) }, icon('close', 'icon-sm')))))
        : h('p', { class: 'muted' }, t('set.noTrackers')),
      h('button', { class: 'btn ghost wide', onclick: addTracker }, icon('plus', 'icon-sm'), t('tr.addTracker'))),

    h('article', { class: 'card' },
      h('h2', {}, t('set.lockTitle')),
      h('p', { class: locked ? 'ok row' : 'muted' }, locked ? [icon('lock', 'icon-sm'), t('set.lockedOn')] : t('set.lockedOff')),
      locked ? h('label', { class: 'field' }, h('span', {}, t('set.autoLock')), autoLock) : null,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn primary', onclick: setPasscode }, locked ? t('lock.change') : t('lock.setPass')),
        locked ? h('button', { class: 'btn ghost', onclick: removePasscode }, t('remove')) : null,
        locked ? h('button', { class: 'btn ghost', onclick: lockNow }, t('lock.now')) : null)),

    mealSettingsCard(foodCtx),
    foodSettingsCard(foodCtx),

    h('article', { class: 'card' },
      h('h2', {}, t('set.yourData')),
      h('p', { class: 'muted small' }, t('set.counts', { tr: fmt(state.trackers.length), en: fmt(state.entries.length), food: fmt(state.food.log.length) })),
      h('p', {}, persist),
      globalThis.POCKET_STATS_HOSTED ? h('p', { class: 'warn small' }, t('set.webWarn')) : null,
      h('div', { class: 'stack' },
        h('button', { class: 'btn ghost', onclick: exportBackup }, locked ? t('set.exportEnc') : t('set.exportBackup')),
        h('button', { class: 'btn ghost', onclick: importBackup }, t('set.restore')),
        h('button', { class: 'btn ghost', onclick: exportCsv }, t('set.exportCsv')),
        h('button', { class: 'btn danger', onclick: eraseAll }, t('set.eraseAll')))),

    h('article', { class: 'card' },
      h('h2', {}, t('set.privacy')),
      h('ul', { class: 'bullets' }, ...[1, 2, 3, 4, 5, 6].map((i) => h('li', {}, t(`set.privacy.${i}`))))),
    h('p', { class: 'muted small center' }, t('set.version', { v: '1.8' })));
}

// ---------- photos stored outside the main record ----------
/**
 * Photos and learned scans are stored as separate encrypted records. Load them into memory, and
 * move any that are still inside the main record (from an older version or a restored backup).
 */
async function attachPhotos() {
  const inline = state.food.myPhotos || {};
  const inlineScans = state.food.scans || {};
  const inlineRecipe = state.food.recipePhotos || {};
  const hasInline = Object.keys(inline).length > 0 || Object.keys(inlineScans).length > 0 || Object.keys(inlineRecipe).length > 0;
  if (hasInline) {
    await vault.savePhotos(inline);
    for (const [id, rec] of Object.entries(inlineScans)) await vault.saveScan(id, rec);
    for (const [id, rec] of Object.entries(inlineRecipe)) await vault.saveRecipePhoto(id, rec);
  }
  state.food.myPhotos = { ...inline, ...(await vault.loadPhotos()) };
  state.food.scans = { ...inlineScans, ...(await vault.loadScans()) };
  state.food.recipePhotos = { ...inlineRecipe, ...(await vault.loadRecipePhotos()) };
  if (hasInline) await vault.save(state);
}

const foodCtx = {
  get state() { return state; },
  savePhoto: (id, url) => vault.savePhoto(id, url),
  saveScan: (id, rec) => vault.saveScan(id, rec),
  deleteScan: (id) => vault.deleteScan(id),
  saveRecipePhoto: (id, rec) => vault.saveRecipePhoto(id, rec),
  deleteRecipePhoto: (id) => vault.deleteRecipePhoto(id),
  commit: () => commit(),
  render: () => render(),
  go: (v) => { view = v; render(); },
  save: () => vault.save(state).catch((err) => toast(t('err.save', { msg: err.message }))),
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
  const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: t('lock.passcode'), 'aria-label': t('lock.passcode'), autofocus: true });
  const err = h('p', { class: 'error', hidden: true });
  const btn = h('button', { class: 'btn primary wide', type: 'submit' }, t('lock.unlock'));
  const form = h('form', {
    class: 'lock',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value) return;
      btn.disabled = true; btn.textContent = t('lock.unlocking'); err.hidden = true;
      try {
        state = normalize(await vault.unlock(input.value));
        await attachPhotos();
        render();
        afterOpen();
      } catch {
        err.textContent = t('lock.wrongDot'); err.hidden = false;
        btn.disabled = false; btn.textContent = t('lock.unlock');
        input.select();
      }
    },
  },
  h('div', { class: 'row', css: { 'align-self': 'flex-end' } }, langToggle(showLock)),
  h('div', { class: 'lock-icon', 'aria-hidden': 'true' }, icon('lock')),
  h('h1', {}, t('app.name')),
  h('p', { class: 'muted' }, t('lock.enter')),
  input, err, btn,
  h('button', {
    type: 'button', class: 'link small',
    onclick: async () => {
      if (!await confirmDialog(t('lock.forgotQ'), t('lock.forgotBody'), t('lock.eraseStart'), true)) return;
      await vault.wipe();
      state = freshState();
      await vault.save(state);
      render();
    },
  }, t('lock.forgot')));
  $app.replaceChildren(form);
  input.focus();
}

// ---------- shell ----------
const TABS = ['today', 'food', 'gym', 'insights', 'settings'];

function render() {
  // Android app: block screenshots and the app-switcher preview while a passcode is set.
  try { globalThis.PocketStatsAndroid?.setSecure?.(vault.hasPasscode()); } catch { /* not in the Android app */ }
  if (!state) return;
  const scroll = view === render.lastView ? window.scrollY : 0;
  render.lastView = view;
  const views = { today: viewToday, food: () => viewFood(foodCtx), gym: () => viewGym(foodCtx), insights: viewInsightsTab, settings: viewSettings };
  $app.replaceChildren(views[view]());
  $tabs.hidden = false;
  $tabs.setAttribute('aria-label', t('tab.main'));
  $tabs.replaceChildren(...TABS.map((id) => h('button', {
    class: `tab${id === view ? ' on' : ''}`, 'aria-current': id === view ? 'page' : null,
    onclick: () => { if (id !== view) { if (id === 'today') curDay = dayKey(); if (id === 'food') resetFoodView(); if (id === 'gym') resetGymView(); } view = id; render(); window.scrollTo(0, 0); },
  }, icon(id), h('span', {}, t(`tab.${id}`)))));
  window.scrollTo(0, scroll);
}

onLang(() => { if (state) render(); });

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

/** After the data is open: load the food list and bring in the starter recipe photos once. */
function afterOpen() {
  warmFoodDb();
  importStarterPhotos(foodCtx).catch(() => { /* not in this build */ });
}

async function boot() {
  applyDocument();
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
    afterOpen();
  } catch (err) {
    $app.replaceChildren(h('div', { class: 'card' }, h('h2', {}, t('err.storageTitle')),
      h('p', { class: 'muted' }, t('err.storageBody')),
      h('p', { class: 'muted small' }, String(err?.message || err))));
  }
}

boot();
