import { api, get } from '../api.js';
import { auth } from '../store.js';
import { go } from '../router.js';
import { $, $$, esc, src, toast, busy, CONDITION_LABEL } from '../ui.js';

const SAMPLE_PHOTOS = [
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=1200&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1200&q=80&auto=format&fit=crop',
];

export default async function sell(app, { params }) {
  if (!auth.loggedIn) { go('#/login?next=' + encodeURIComponent(location.hash)); return; }
  const editing = !!params.id;
  const [{ items: cats, conditions }, existing] = await Promise.all([
    get('/categories'), editing ? get(`/listings/${params.id}`).then(r => r.item) : null,
  ]);
  if (editing && !existing.isMine) { toast('You can only edit your own listings.', { type: 'error' }); go(`#/item/${params.id}`); return; }
  const v = existing || { condition: 'like-new', quantity: 1, location: auth.user.location || '' };

  // photos: [{ kind: 'url', url } | { kind: 'file', file, preview }]
  let photos = (v.images || []).map(url => ({ kind: 'url', url }));

  app.innerHTML = `
  <div class="container"><div class="form-page">
    <span class="eyebrow fade-up">${editing ? 'Edit listing' : 'Sell on Agora'}</span>
    <h1 class="fade-up" style="--d:.06s">${editing ? 'Update your <em>listing</em>' : 'What are you <em>selling?</em>'}</h1>
    <p class="muted fade-up" style="--d:.1s;margin-bottom:32px">Great photos and an honest description sell items 3× faster.</p>
    <form id="sellForm" novalidate>
      <div id="err"></div>
      <div class="panel fade-up" style="--d:.14s">
        <h3>Photos</h3>
        <label class="dropzone" id="drop">
          <input type="file" id="files" accept="image/*" multiple hidden />
          <b>Drop photos here or click to upload</b><span class="muted">JPG, PNG or WEBP · up to 8 photos · first photo is the cover</span>
        </label>
        <div class="field" style="margin:16px 0 0"><label for="url">…or paste an image link</label>
          <div style="display:flex;gap:8px"><input class="input" id="url" placeholder="https://images.unsplash.com/…" /><button type="button" class="btn" id="addUrl">Add</button></div>
          <small>No photo handy? <button type="button" class="link" id="sample">Use a sample photo</button></small>
        </div>
        <div class="previews" id="previews"></div>
      </div>
      <div class="panel fade-up" style="--d:.2s">
        <h3>Details</h3>
        <div class="field"><label for="title">Title</label><input class="input" id="title" name="title" maxlength="100" placeholder="e.g. Mid-century oak armchair" value="${esc(v.title || '')}" /></div>
        <div class="field"><label for="description">Description</label><textarea class="textarea" id="description" name="description" placeholder="Condition, size, age, why you're selling…">${esc(v.description || '')}</textarea></div>
        <div class="row">
          <div class="field"><label for="category">Category</label><select id="category" name="category">
            <option value="">Choose a category</option>${cats.map(c => `<option value="${c.slug}" ${c.slug === v.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
          <div class="field"><label for="location">Location</label><input class="input" id="location" name="location" placeholder="City, Country" value="${esc(v.location || '')}" /></div>
        </div>
        <div class="field"><label>Condition</label><div class="seg">
          ${conditions.map(c => `<input type="radio" name="condition" id="c-${c}" value="${c}" ${c === v.condition ? 'checked' : ''} /><label for="c-${c}">${CONDITION_LABEL[c]}</label>`).join('')}
        </div></div>
      </div>
      <div class="panel fade-up" style="--d:.26s">
        <h3>Price</h3>
        <div class="row-3">
          <div class="field"><label for="price">Your price (€)</label><input class="input" id="price" name="price" type="number" min="1" step="0.01" placeholder="0.00" value="${v.price ?? ''}" /></div>
          <div class="field"><label for="originalPrice">Original price</label><input class="input" id="originalPrice" name="originalPrice" type="number" min="0" step="0.01" placeholder="Optional" value="${v.originalPrice ?? ''}" /></div>
          <div class="field"><label for="quantity">Quantity</label><input class="input" id="quantity" name="quantity" type="number" min="${editing ? 0 : 1}" max="999" value="${v.quantity ?? 1}" /></div>
        </div>
        <small class="muted" id="earn"></small>
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px">
        <a href="${editing ? `#/item/${v.id}` : '#/'}" class="btn btn--lg">Cancel</a>
        <button class="btn btn--ink btn--lg magnetic" type="submit">${editing ? 'Save changes' : 'Publish listing'} <span class="arrow">→</span></button>
      </div>
    </form>
  </div></div>`;

  const renderPreviews = () => {
    $('#previews').innerHTML = photos.map((p, i) => `
      <div class="preview"><img src="${p.kind === 'file' ? p.preview : src(p.url)}" alt="Photo ${i + 1}" />
        ${i === 0 ? '<span class="cover">Cover</span>' : ''}<button type="button" data-rm="${i}" aria-label="Remove photo">✕</button></div>`).join('');
    $$('[data-rm]', app).forEach(b => (b.onclick = () => { photos.splice(+b.dataset.rm, 1); renderPreviews(); }));
  };
  const addFiles = (files) => {
    for (const file of files) {
      if (photos.length >= 8) { toast('Maximum 8 photos.', { type: 'error' }); break; }
      if (!file.type.startsWith('image/')) { toast(`${file.name} is not an image.`, { type: 'error' }); continue; }
      photos.push({ kind: 'file', file, preview: URL.createObjectURL(file) });
    }
    renderPreviews();
  };
  const addUrl = (u) => {
    if (!/^https?:\/\//.test(u)) { toast('Paste a full link starting with http(s)://', { type: 'error' }); return; }
    photos.push({ kind: 'url', url: u }); renderPreviews();
  };
  renderPreviews();

  const drop = $('#drop');
  $('#files').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
  $('#addUrl').onclick = () => { addUrl($('#url').value.trim()); $('#url').value = ''; };
  $('#sample').onclick = () => addUrl(SAMPLE_PHOTOS[photos.length % SAMPLE_PHOTOS.length]);

  const earn = () => {
    const p = parseFloat($('#price').value) || 0;
    $('#earn').textContent = p ? `You'll earn ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(p)} — Agora charges sellers no fees.` : '';
  };
  $('#price').oninput = earn; earn();

  $('#sellForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    $$('.invalid', f).forEach(el => el.classList.remove('invalid'));
    const problems = [];
    const need = (el, ok, msg) => { if (!ok) { el.classList.add('invalid'); problems.push(msg); } };
    need(f.title, f.title.value.trim().length >= 3, 'Add a title (3+ characters).');
    need(f.description, f.description.value.trim().length >= 10, 'Add a description (10+ characters).');
    need(f.category, !!f.category.value, 'Choose a category.');
    need(f.price, parseFloat(f.price.value) > 0, 'Set a price.');
    if (!photos.length) problems.push('Add at least one photo.');
    if (problems.length) {
      $('#err').innerHTML = `<div class="form-error">${problems.map(esc).join('<br/>')}</div>`;
      $('#err').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    $('#err').innerHTML = '';
    const fd = new FormData();
    for (const k of ['title', 'description', 'category', 'location', 'price', 'originalPrice', 'quantity']) fd.append(k, f[k].value);
    fd.append('condition', f.condition.value);
    fd.append('imageUrls', JSON.stringify(photos.filter(p => p.kind === 'url').map(p => p.url)));
    if (editing) fd.append('keepImages', '1');
    photos.filter(p => p.kind === 'file').forEach(p => fd.append('images', p.file));
    try {
      const btn = f.querySelector('[type=submit]');
      const r = await busy(btn, () => api(editing ? `/listings/${v.id}` : '/listings', { method: editing ? 'PATCH' : 'POST', form: fd }));
      toast(editing ? 'Listing updated' : 'Your listing is live! 🎉', { image: r.item.images[0], sub: r.item.title });
      go(`#/item/${r.item.id}`);
    } catch (err) {
      $('#err').innerHTML = `<div class="form-error">${esc(err.message)}${err.where ? `<br/><small>Problem in: ${esc(err.where)}</small>` : ''}</div>`;
      $('#err').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
}
