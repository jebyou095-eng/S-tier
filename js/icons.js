// Simple line icons (24 × 24, stroke 2). No emoji anywhere in the UI.
// Icons that point a direction carry the "flip" class so they mirror in Arabic.
const P = {
  back: 'M15 18l-6-6 6-6',
  next: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12l5 5L20 7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  camera: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5a1.5 1.5 0 1 0 0-.01',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  hide: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.5M6.4 7.4C4.2 9 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4-1M10 10a3 3 0 0 0 4 4',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  barcode: 'M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12',
  label: 'M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8zM14 3v5h5M8.5 12.5h7M8.5 16h5',
  souk: 'M3 10l2-6h14l2 6M4 10v10h16V10M3 10h18M9 20v-6h6v6',
  ai: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  flame: 'M12 21c-3.9 0-6-2.6-6-5.6C6 11 11 9 10 3c3 1.8 8 6 8 12 0 3.6-2.6 6-6 6zM12 21c-1.7 0-2.6-1.2-2.6-2.6 0-2 2.6-3 2.6-5.4 1.3 1 2.6 2.6 2.6 5 0 1.8-1.1 3-2.6 3z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  today: 'M3 12l9-8 9 8M5 10v10h14V10',
  food: 'M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 8h3v10',
  gym: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  insights: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2L9 2 6 3l.5 2L5 6.5 3 6 2 9l2 1v2l-2 1 1 3 2-.5L6.5 17 6 19l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  plate: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  brush: 'M14 4l6 6-8 8H6v-6zM6 18l-2 2',
  eraser: 'M8 20h12M5 15l8-8 6 6-6 6H9z',
  crop: 'M6 2v16h16M2 6h16v16',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  magic: 'M5 19L17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.7 1.3L21 14l-1.3.7L19 16l-.7-1.3L17 14l1.3-.7z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  zoom: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8M10.5 8v5M8 10.5h5',
  compare: 'M12 3v18M5 6h4v12H5zM15 6h4v12h-4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.01',
  refresh: 'M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1M18 3v4h-4M6 21v-4h4',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  drop: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z',
  bowl: 'M3 11h18a9 9 0 0 1-18 0zM8 7c0-1 1-2 1-3M12 7c0-1 1-2 1-3M16 7c0-1 1-2 1-3',
  glass: 'M6 3h12l-1.5 17h-9zM6.5 8h11',
  sparkle: 'M12 3v6M12 15v6M3 12h6M15 12h6',
  easy: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5M9 9.5h.01M15 9.5h.01',
  good: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5h.01M15 9.5h.01',
  hard: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 16h7M8 9l2 1M16 9l-2 1',
  toomuch: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 16c.8-1 1.8-1.5 3-1.5s2.2.5 3 1.5M8 8.5l2 2M10 8.5l-2 2M14 8.5l2 2M16 8.5l-2 2',
};
const DIRECTIONAL = new Set(['back', 'next', 'undo', 'redo']);

export function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `line-icon${DIRECTIONAL.has(name) ? ' flip' : ''}${cls ? ` ${cls}` : ''}`);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || P.info);
  svg.append(p);
  return svg;
}

export const ICON_NAMES = Object.keys(P);
