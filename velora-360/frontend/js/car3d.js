// =====================================================================
//  Velora 360 · procedural 3D cars + 360° viewer (three.js)
//  Every car is generated from its body type and real dimensions, so
//  every model gets a true 360° exterior and interior view.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from './vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from './vendor/three/addons/RoomEnvironment.js';

// Side profiles, normalised: u = position along the car (-0.5 rear … +0.5 front), v = fraction of total height.
// body: upper outline of the lower body from the nose to the tail. cabin: glasshouse outline.
const PROFILES = {
  sedan: {
    body: [[0.5, 0.24], [0.507, 0.34], [0.5, 0.42], [0.475, 0.47], [0.38, 0.515], [0.2, 0.565], [0.15, 0.575], [-0.3, 0.61], [-0.44, 0.6], [-0.492, 0.56], [-0.506, 0.44], [-0.5, 0.26]],
    cabin: [[0.15, 0.565], [0.02, 0.93], [-0.08, 0.995], [-0.2, 0.99], [-0.31, 0.605]],
    clearance: 0.5, lampF: 0.43, lampR: 0.54, frontOH: 0.45,
  },
  hatchback: {
    body: [[0.5, 0.26], [0.507, 0.38], [0.495, 0.46], [0.4, 0.53], [0.22, 0.585], [-0.43, 0.63], [-0.495, 0.59], [-0.507, 0.42], [-0.5, 0.27]],
    cabin: [[0.22, 0.575], [0.06, 0.935], [-0.18, 1.0], [-0.41, 0.97], [-0.47, 0.625]],
    clearance: 0.52, lampF: 0.45, lampR: 0.55, frontOH: 0.55,
  },
  suv: {
    body: [[0.5, 0.29], [0.507, 0.46], [0.497, 0.55], [0.44, 0.6], [0.25, 0.64], [-0.45, 0.675], [-0.492, 0.645], [-0.506, 0.48], [-0.5, 0.3]],
    cabin: [[0.25, 0.635], [0.12, 0.95], [-0.05, 1.0], [-0.44, 0.985], [-0.48, 0.665]],
    clearance: 0.75, lampF: 0.53, lampR: 0.6, frontOH: 0.5,
  },
  coupe: {
    body: [[0.5, 0.21], [0.507, 0.3], [0.495, 0.37], [0.37, 0.445], [0.14, 0.525], [-0.36, 0.59], [-0.47, 0.57], [-0.505, 0.44], [-0.5, 0.23]],
    cabin: [[0.14, 0.515], [-0.03, 0.935], [-0.13, 1.0], [-0.26, 0.94], [-0.4, 0.585]],
    clearance: 0.4, lampF: 0.36, lampR: 0.51, frontOH: 0.48,
  },
  pickup: {
    body: [[0.5, 0.31], [0.507, 0.52], [0.497, 0.61], [0.42, 0.655], [0.24, 0.675], [-0.12, 0.675], [-0.5, 0.665], [-0.507, 0.48], [-0.5, 0.32]],
    cabin: [[0.245, 0.67], [0.135, 0.96], [0.0, 1.0], [-0.1, 0.995], [-0.115, 0.67]],
    clearance: 0.85, lampF: 0.55, lampR: 0.6, bed: [-0.13, -0.49], frontOH: 0.5,
  },
};

const mat = {
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x0b1118, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 1.6, side: THREE.DoubleSide }),
  paint: (hex) => new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.25 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.2 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.22 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.08 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.7 }),
  dash: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x2a7fff, emissiveIntensity: 0.6, roughness: 0.2 }),
};

function profileShape(points, L, H, bottom, wheels) {
  const s = new THREE.Shape();
  const P = points.map(([u, v]) => new THREE.Vector2(u * L, v * H));
  const startX = P.at(-1).x + 0.04, endX = P[0].x - 0.04;
  s.moveTo(startX, bottom);
  if (wheels) {
    for (const { x, r } of wheels) {
      const ra = r + 0.045;
      const a0 = Math.asin(Math.max(-1, Math.min(1, (bottom - r) / ra)));
      s.lineTo(x - ra * Math.cos(a0), bottom);
      s.absarc(x, r, ra, Math.PI - a0, a0, true);
    }
  }
  s.lineTo(endX, bottom);
  s.lineTo(P[0].x, P[0].y);
  s.splineThru(P.slice(1));
  s.lineTo(startX, bottom);
  return s;
}

function extrude(shape, depth, bevel, material) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 4, curveSegments: 28 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

function wheel(r, width) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 40, 1), mat.rubber);
  tire.rotation.x = Math.PI / 2; tire.castShadow = true;
  const sidewall = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, r * 0.14, 12, 40), mat.rubber);
  sidewall.position.z = width / 2 - 0.01;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, width * 0.9, 32), mat.rim);
  rim.rotation.x = Math.PI / 2; rim.position.z = 0.012;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, width * 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x5a5e66, metalness: 0.8, roughness: 0.4 }));
  disc.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.12, width + 0.01, 16), mat.chrome);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.02;
  g.add(tire, sidewall, disc, rim, hub);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.12, r * 1.2, 0.03), mat.rim);
    sp.position.z = width / 2 + 0.005; sp.rotation.z = (i / 5) * Math.PI * 2;
    sp.position.x = 0; sp.translateY(r * 0.3);
    g.add(sp);
  }
  return g;
}

/** Build a car. spec = { body, dims:{length,width,height,wheelbase} }. Returns a Group with .userData helpers. */
export function buildCar(spec, colorHex = '#a9afb7') {
  const P = PROFILES[spec.body] || PROFILES.sedan;
  const L = spec.dims.length / 1000, W = spec.dims.width / 1000, H = spec.dims.height / 1000, WB = spec.dims.wheelbase / 1000;
  const r = spec.body === 'coupe' ? 0.34 : Math.min(0.44, Math.max(0.3, H * 0.215));
  const bottom = r * P.clearance;
  const fx0 = L / 2 - (L - WB) * (P.frontOH ?? 0.5);
  const wheels = [{ x: fx0 - WB, r }, { x: fx0, r }];
  const car = new THREE.Group();
  const paint = mat.paint(colorHex);
  const glass = mat.glass();

  // Lower body
  car.add(extrude(profileShape(P.body, L, H, bottom, wheels), W, 0.11, paint));

  // Glasshouse + painted roof strip + pillars
  const cab = new THREE.Shape();
  const CP = P.cabin.map(([u, v]) => new THREE.Vector2(u * L, v * H));
  cab.moveTo(CP[0].x, CP[0].y); cab.splineThru(CP.slice(1)); cab.lineTo(CP[0].x, CP[0].y);
  const cabW = W * 0.8;
  const cabin = extrude(cab, cabW, 0.13, glass);
  car.add(cabin);
  const roofPts = CP.slice(1, -1);
  const roof = new THREE.Shape();
  roof.moveTo(roofPts[0].x, roofPts[0].y + 0.004); roof.splineThru(roofPts.slice(1).map(p => new THREE.Vector2(p.x, p.y + 0.004)));
  [...roofPts].reverse().forEach(p => roof.lineTo(p.x, p.y - 0.035));
  car.add(extrude(roof, cabW - 0.04, 0.05, paint));
  const midX = (CP[0].x + CP.at(-1).x) / 2 - 0.05;
  const pillarH = H - CP[0].y - 0.02;
  for (const z of [1, -1]) {
    car.add(box(0.07, pillarH, 0.02, mat.trim, midX, CP[0].y + pillarH / 2, z * (cabW / 2 + 0.035)));
    // mirrors
    car.add(box(0.12, 0.08, 0.16, paint, CP[0].x - 0.05, CP[0].y + 0.06, z * (W / 2 + 0.06)));
    // door handles
    car.add(box(0.12, 0.025, 0.02, mat.chrome, midX + 0.35, CP[0].y - 0.08, z * (W / 2 + 0.005)));
    car.add(box(0.12, 0.025, 0.02, mat.chrome, midX - 0.45, CP[0].y - 0.08, z * (W / 2 + 0.005)));
    // side skirt
    car.add(box(WB - r * 2.3, 0.05, 0.02, mat.trim, fx0 - WB / 2, bottom + 0.04, z * (W / 2 + 0.01)));
  }

  // Pickup bed cover
  if (P.bed) {
    const [a, b] = P.bed.map(u => u * L);
    car.add(box(a - b, 0.02, W * 0.86, mat.trim, (a + b) / 2, P.body[6][1] * H + 0.012, 0));
  }

  // Lights, grille, plates
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0xdfe9ff, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0b0b, emissive: 0xff1a1a, emissiveIntensity: 0.25, roughness: 0.3 });
  const fx = L * 0.507 + 0.115, rx = -L * 0.507 - 0.115; // bevel pushes the body ~0.1 m outwards
  for (const z of [1, -1]) {
    const hl = box(0.05, 0.055, W * 0.24, lampMat, fx - 0.03, P.lampF * H, z * W * 0.3); car.add(hl);
    const tl = box(0.05, 0.06, W * 0.26, tailMat, rx + 0.03, P.lampR * H, z * W * 0.3); car.add(tl);
  }
  car.add(box(0.05, H * 0.09, W * 0.36, mat.trim, fx - 0.03, P.lampF * H - H * 0.075, 0)); // grille
  car.add(box(0.05, H * 0.05, W * 0.7, mat.trim, fx - 0.04, bottom + H * 0.05, 0)); // lower intake
  car.add(box(0.03, 0.11, 0.5, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }), rx + 0.03, P.lampR * H - H * 0.14, 0)); // plate
  car.add(box(0.03, H * 0.03, W * 0.5, mat.chrome, rx + 0.03, P.lampR * H, 0)); // light bar

  // Wheels
  const tw = Math.min(0.3, W * 0.13);
  for (const { x } of wheels) for (const z of [1, -1]) {
    const w = wheel(r, tw);
    w.position.set(x, r, z * (W / 2 - tw / 2 + 0.01));
    if (z < 0) w.rotation.y = Math.PI;
    car.add(w);
  }

  // Interior: sits inside the glasshouse, on a dark cabin floor laid over the beltline
  const interior = new THREE.Group();
  const cabinFront = CP[0].x, cabinRear = CP.at(-1).x, cabLen = cabinFront - cabinRear;
  const floorY = Math.max(CP[0].y, CP.at(-1).y) + 0.012;
  const innerW = cabW - 0.08;
  const seatX = cabinFront - cabLen * 0.42;
  const seatZ = W * 0.2;
  const seat = (x, z, wdt) => {
    const g = new THREE.Group();
    g.add(box(0.42, 0.1, wdt, mat.leather, 0, 0.05, 0));
    const back = box(0.08, 0.42, wdt, mat.leather, -0.2, 0.28, 0); back.rotation.z = 0.2; g.add(back);
    if (wdt < 0.7) g.add(box(0.07, 0.12, wdt * 0.55, mat.leather, -0.26, 0.53, 0));
    g.position.set(x, floorY, z);
    return g;
  };
  interior.add(box(cabLen - 0.1, 0.012, innerW, new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 }), (cabinFront + cabinRear) / 2 - 0.02, floorY, 0));
  interior.add(seat(seatX, -seatZ, 0.48), seat(seatX, seatZ, 0.48));
  if (spec.seats >= 4) interior.add(seat(Math.max(cabinRear + 0.45, seatX - 0.8), 0, innerW * 0.9));
  const dashX = cabinFront - 0.32;
  interior.add(box(0.34, 0.16, innerW, mat.dash, dashX, floorY + 0.08, 0)); // dashboard
  interior.add(box(0.02, 0.12, 0.36, mat.screen, dashX - 0.17, floorY + 0.2, 0)); // centre screen
  interior.add(box(0.02, 0.07, 0.26, mat.screen, dashX - 0.17, floorY + 0.17, -seatZ)); // driver display
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 12, 40), mat.dash);
  sw.position.set(dashX - 0.3, floorY + 0.2, -seatZ); sw.rotation.y = Math.PI / 2;
  interior.add(sw, box(0.02, 0.025, 0.26, mat.chrome, dashX - 0.3, floorY + 0.2, -seatZ));
  interior.add(box(0.55, 0.1, 0.18, mat.dash, seatX + 0.15, floorY + 0.05, 0)); // centre console
  car.add(interior);

  car.userData = {
    paint, glass, lampMat, tailMat, L, W, H,
    head: new THREE.Vector3(seatX - 0.08, floorY + Math.min(0.42, (H - floorY) * 0.72), -seatZ),
    forward: new THREE.Vector3(1, -0.32, 0).normalize(),
  };
  return car;
}

// ---------- Studio scene ----------
function studio(renderer, night = false) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.background = new THREE.Color(night ? 0x07090d : 0xe9ebee);
  scene.fog = new THREE.Fog(scene.background, 18, 40);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, night ? 0.15 : 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, night ? 0.2 : 2.2);
  sun.position.set(4, 9, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.radius = 6;
  scene.add(hemi, sun);
  // floor + soft contact shadow
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: night ? 0x0d1015 : 0xdfe2e6, roughness: 0.85, metalness: 0.0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.002;
  // turntable ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.66, 96), new THREE.MeshBasicMaterial({ color: night ? 0x2a6cff : 0xb7bcc5, transparent: true, opacity: night ? 0.7 : 0.6 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003;
  scene.add(floor, blob, ring);
  return { scene, floor, blob, ring, hemi, sun };
}

// ---------- Interactive 360° viewer ----------
export function createViewer(container, spec, { color, autoRotate = true, interactive = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const S = studio(renderer);
  const { scene } = S;
  let car = buildCar(spec, color || spec.colors?.[0]?.hex);
  scene.add(car);
  const fit = () => {
    const { L, W } = car.userData;
    S.blob.scale.set(L * 1.35, W * 1.7, 1);
    S.ring.scale.setScalar(Math.max(1, L / 4.6));
  };
  fit();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  const extDist = () => car.userData.L * 1.55 + 2.2;
  camera.position.set(extDist() * 0.78, 1.7, extDist() * 0.62);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.set(0, car.userData.H * 0.45, 0);
  controls.enablePan = false; controls.autoRotate = autoRotate; controls.autoRotateSpeed = 0.9;
  controls.enabled = interactive;
  controls.addEventListener('start', () => (controls.autoRotate = false, state.userTouched = true));

  const state = { mode: 'exterior', night: false, userTouched: false, tween: null };
  const headlights = [];

  function resize() {
    const w = container.clientWidth || 600, h = container.clientHeight || 400;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    // Narrow screens: widen the view so the whole car still fits (exterior only)
    if (state.mode === 'exterior') camera.fov = baseFov();
    camera.updateProjectionMatrix();
  }
  function baseFov() {
    const a = camera.aspect || 1.6;
    return a >= 1.4 ? 32 : Math.min(70, (2 * Math.atan(Math.tan((16 * Math.PI) / 180) * 1.4 / a) * 180) / Math.PI);
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // Smooth camera moves
  const limits = (min, max, pMin, pMax) => Object.assign(controls, { minDistance: min, maxDistance: max, minPolarAngle: pMin, maxPolarAngle: pMax });
  function flyTo(pos, target, ms = 1100, onDone) {
    const p0 = camera.position.clone(), t0 = controls.target.clone(), start = performance.now();
    limits(0, Infinity, 0, Math.PI); // free during the flight, otherwise the limits make the camera jump
    state.tween = (now) => {
      const k = Math.min(1, (now - start) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(p0, pos, e); controls.target.lerpVectors(t0, target, e);
      if (k >= 1) { state.tween = null; onDone?.(); }
    };
  }
  function zoomFov(to) {
    const from = camera.fov, t0 = performance.now();
    const step = (n) => { const k = Math.min(1, (n - t0) / 1200); camera.fov = from + (to - from) * k; camera.updateProjectionMatrix(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const extLimits = () => limits(car.userData.L * 0.9, extDist() * 1.6, Math.PI * 0.12, Math.PI * 0.49);

  let raf, visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting)); io.observe(container);
  // intro: swoop in
  const introFrom = camera.position.clone().multiplyScalar(1.6).setY(3.5);
  const introTo = camera.position.clone();
  camera.position.copy(introFrom); flyTo(introTo, controls.target.clone(), 1600, extLimits);
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!visible) return;
    if (state.tween) state.tween(now);
    controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);

  const api = {
    setColor(hex) {
      const from = car.userData.paint.color.clone(), to = new THREE.Color(hex), t0 = performance.now();
      const step = (n) => { const k = Math.min(1, (n - t0) / 450); car.userData.paint.color.lerpColors(from, to, k); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    },
    setMode(mode) {
      state.mode = mode;
      const u = car.userData;
      if (mode === 'interior') {
        controls.autoRotate = false;
        u.glass.opacity = 0.16;
        zoomFov(72);
        const look = u.head.clone().add(u.forward.clone().multiplyScalar(0.25));
        flyTo(u.head.clone(), look, 1300, () => limits(0.2, 0.3, 0.45, 2.5));
      } else {
        u.glass.opacity = 0.62;
        zoomFov(baseFov());
        flyTo(new THREE.Vector3(extDist() * 0.78, 1.7, extDist() * 0.62), new THREE.Vector3(0, u.H * 0.45, 0), 1300, extLimits);
      }
    },
    view(name) {
      if (state.mode !== 'exterior') api.setMode('exterior');
      const d = extDist(), y = car.userData.H * 0.45;
      const V = { front: [d, 1.2, 0.01], rear: [-d, 1.2, 0.01], side: [0.01, 1.1, d], top: [0.01, d * 0.95, 0.4], three: [d * 0.78, 1.7, d * 0.62] };
      controls.autoRotate = false;
      flyTo(new THREE.Vector3(...V[name]), new THREE.Vector3(0, y, 0), 1100, () => limits(car.userData.L * 0.9, extDist() * 1.6, 0.01, Math.PI * 0.49));
    },
    setNight(on) {
      state.night = on;
      const u = car.userData;
      scene.background.set(on ? 0x07090d : 0xe9ebee); scene.fog.color.copy(scene.background);
      S.floor.material.color.set(on ? 0x0d1015 : 0xdfe2e6);
      S.ring.material.color.set(on ? 0x2a6cff : 0xb7bcc5);
      S.hemi.intensity = on ? 0.12 : 0.9; S.sun.intensity = on ? 0.15 : 2.2;
      u.lampMat.emissiveIntensity = on ? 6 : 0.25; u.tailMat.emissiveIntensity = on ? 4 : 0.25;
      u.paint.envMapIntensity = on ? 0.3 : 1.25; u.glass.envMapIntensity = on ? 0.4 : 1.6;
      if (on && !headlights.length) for (const z of [1, -1]) {
        const s = new THREE.SpotLight(0xe8f0ff, 60, 18, 0.45, 0.6, 1.4);
        s.position.set(u.L / 2, u.H * 0.5, z * u.W * 0.33); s.target.position.set(u.L / 2 + 6, 0, z * 0.8);
        car.add(s, s.target); headlights.push(s);
      }
      headlights.forEach(s => (s.visible = on));
    },
    setAutoRotate(on) { controls.autoRotate = on; },
    get autoRotate() { return controls.autoRotate; },
    get mode() { return state.mode; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
      scene.traverse(o => { o.geometry?.dispose?.(); });
      renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
    },
  };
  return api;
}

// ---------- Still images for cards (one shared offscreen renderer) ----------
let snap = null;
const cache = new Map();
export function snapshot(spec, colorHex, { w = 720, h = 440, angle = 'three' } = {}) {
  const key = `${spec.id}|${colorHex}|${angle}|${w}x${h}|${spec.dims.length}${spec.body}`;
  if (cache.has(key)) return cache.get(key);
  if (!snap) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    const S = studio(renderer);
    S.ring.visible = false;
    snap = { renderer, ...S, camera: new THREE.PerspectiveCamera(30, w / h, 0.1, 100), car: null };
  }
  const { renderer, scene, camera } = snap;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (snap.car) { scene.remove(snap.car); snap.car.traverse(o => o.geometry?.dispose()); }
  const car = buildCar(spec, colorHex); scene.add(car); snap.car = car;
  snap.blob.scale.set(car.userData.L * 1.35, car.userData.W * 1.7, 1);
  const d = car.userData.L * 1.32 + 1.9;
  const pos = { three: [d * 0.8, 1.45, d * 0.6], side: [0.01, 1.0, d * 1.05], front: [d, 1.1, 0.01] }[angle];
  camera.position.set(...pos); camera.lookAt(0, car.userData.H * 0.42, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.86);
  cache.set(key, url);
  return url;
}

export const webglOK = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
