// Food recognition from a photo, using Claude's vision.
//
// PRIVACY: this is the one feature that sends a photo off the phone. It only runs
// when you tap "Recognise from photo", after you've turned it on in Settings.
// - Android app / downloaded file: sent to Anthropic's API with YOUR API key
//   (stored on the phone, encrypted if you set a passcode).
// - claude.ai web link: sent through your Claude account (the page asks first).
// Only the photo and the food list below are sent: never your diary or body stats.
import { runBundledLib } from './ui.js';

const MODEL = 'claude-opus-5-5';
const SDK_SRC = 'js/vendor/anthropic-sdk.min.js';

let sdkLoad = null;
function loadSdk() {
  if (globalThis.Anthropic || runBundledLib('lib-claude')) return Promise.resolve(globalThis.Anthropic); // bundled builds carry it inline
  sdkLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_SRC;
    s.onload = () => resolve(globalThis.Anthropic);
    s.onerror = () => reject(new Error('Could not load the Claude SDK'));
    document.head.append(s);
  });
  return sdkLoad;
}

const n = { type: 'number' };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'notes'],
  properties: {
    notes: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'catalog_id', 'grams', 'confidence', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g', 'ingredients'],
        properties: {
          name: { type: 'string' },
          catalog_id: { type: 'string' },
          grams: n,
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          kcal_per_100g: n, protein_per_100g: n, carbs_per_100g: n, fat_per_100g: n,
          ingredients: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['name', 'grams'], properties: { name: { type: 'string' }, grams: n } },
          },
        },
      },
    },
  },
};

function instructions(catalog) {
  return `You identify food in a photo for a calorie-tracking app used in Morocco.

List every distinct food or drink you can see. For each one:
- name: a short, specific name (use the Moroccan name when it is a Moroccan dish, e.g. "Msemen", "Harira", "Chicken tagine").
- catalog_id: if it matches an item in the catalogue below, its id exactly as written; otherwise "".
- grams: your best estimate of the edible amount shown. Use the plate, glass, cutlery, bread or hand as a size reference. A glass of atay is about 120 ml, a round khobz about 400 g, a bowl of harira about 300 g.
- confidence: high, medium or low, for the identification and the amount together.
- kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g: your estimate for this food as shown (visible oil, sauce or sugar included).
- ingredients: the main ingredients you can see or that the dish normally contains, with grams for the portion shown.

If you can't tell what something is, say so in its name and use low confidence rather than guessing confidently. If there is no food in the photo, return an empty items list and explain in notes. Use notes for anything that limits accuracy (hidden oil, partly eaten, unclear size).

Catalogue (id: name):
${catalog.map((f) => `${f.id}: ${f.name}${f.fr && f.fr !== f.name ? ` / ${f.fr}` : ''}`).join('\n')}`;
}

/** Downscale a photo to keep the upload small and fast (max 1024 px, JPEG). */
export async function preparePhoto(file, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { blob, base64: dataUrl.split(',')[1], dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clean(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  const num = (v, max) => (Number.isFinite(+v) && +v >= 0 ? Math.min(+v, max) : 0);
  return {
    notes: String(result?.notes || '').slice(0, 500),
    items: items.slice(0, 12).map((x) => ({
      name: String(x?.name || 'Unknown food').slice(0, 80),
      catalogId: String(x?.catalog_id || '').slice(0, 40),
      grams: Math.round(num(x?.grams, 3000)),
      confidence: ['high', 'medium', 'low'].includes(x?.confidence) ? x.confidence : 'low',
      n: { kcal: num(x?.kcal_per_100g, 900), p: num(x?.protein_per_100g, 100), c: num(x?.carbs_per_100g, 100), f: num(x?.fat_per_100g, 100), fib: 0 },
      ingredients: (Array.isArray(x?.ingredients) ? x.ingredients : []).slice(0, 15)
        .map((i) => ({ name: String(i?.name || '').slice(0, 50), grams: Math.round(num(i?.grams, 3000)) })).filter((i) => i.name),
    })),
  };
}

export class RecognitionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Android app / downloaded file: Anthropic API with the user's own key, via the official SDK. */
async function viaApi(photo, catalog, apiKey) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      // The instructions + catalogue never change between photos, so cache them.
      system: [{ type: 'text', text: instructions(catalog), cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo.base64 } },
          { type: 'text', text: 'What food is in this photo, and how much?' },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new RecognitionError('auth', 'Your API key was not accepted. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new RecognitionError('auth', 'This API key is not allowed to use this model.');
    if (err instanceof Anthropic.RateLimitError) throw new RecognitionError('rate', 'Too many requests right now. Wait a minute and try again.');
    if (err instanceof Anthropic.BadRequestError) throw new RecognitionError('bad', `The request was rejected: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new RecognitionError('offline', "Couldn't reach Claude. Check your internet connection.");
    if (err instanceof Anthropic.APIError) throw new RecognitionError('api', `Claude API error ${err.status ?? ''}. Try again later.`);
    throw err;
  }
  if (response.stop_reason === 'refusal') throw new RecognitionError('refusal', 'Claude declined to analyse this photo.');
  if (response.stop_reason === 'max_tokens') throw new RecognitionError('bad', 'The answer was cut off. Try a photo with fewer items.');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new RecognitionError('bad', 'Claude returned no answer.');
  try {
    return clean(JSON.parse(text));
  } catch {
    throw new RecognitionError('bad', "Couldn't read Claude's answer. Try again.");
  }
}

/** claude.ai web-link version: the page's built-in Claude access (asks the viewer first). */
async function viaSample(photo, catalog) {
  const sample = await globalThis.claude?.use?.('sample');
  if (!sample) throw new RecognitionError('unavailable', 'Claude is not available in this view.');
  try {
    const result = await sample.json(
      `${instructions(catalog)}\n\nThe attached image is a photo of food. Answer with JSON only, exactly in this shape:\n${JSON.stringify(SCHEMA)}`,
      { images: [photo.blob] },
    );
    return clean(result);
  } catch (err) {
    const msg = {
      not_granted: 'Claude access was not allowed for this page.',
      rate_limited: 'Too many requests right now. Wait a minute and try again.',
      images_unavailable: 'This view cannot send images to Claude.',
      invalid_json: "Couldn't read Claude's answer. Try again.",
    }[err?.code];
    throw new RecognitionError(err?.code || 'api', msg || 'Recognition failed. Try again later.');
  }
}

export const recognitionMode = () => (globalThis.POCKET_STATS_HOSTED ? 'sample' : 'api');

export async function recognizeFood(file, catalog, { apiKey } = {}) {
  const photo = await preparePhoto(file);
  const result = recognitionMode() === 'sample' ? await viaSample(photo, catalog) : await viaApi(photo, catalog, apiKey);
  return { ...result, photo: photo.dataUrl };
}
