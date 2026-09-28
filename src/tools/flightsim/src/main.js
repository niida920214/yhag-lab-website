import { CONFIG } from '../config.runtime.js';
import { AIRCRAFT_TYPES } from './aircraft.js';
import { FlightModel } from './fdm.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { buildAircraftGLB } from './model.js';
import { Explosion } from './explosion.js';
import { Cockpit } from './cockpit.js';
import { Autopilot } from './autopilot.js';
import { FLAP_STEPS } from './controls.js';

const Cesium = window.Cesium;
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

// ---------- 機体 ----------
const AC = AIRCRAFT_TYPES[CONFIG.AIRCRAFT] ?? AIRCRAFT_TYPES.airliner;
const GEAR_H = AC.gear[0].r[2];   // 重心から接地点までの高さ

// ---------- 開始地点 ----------
// 羽田C滑走路（34R）のプリセットは概算座標．Google Mapsで滑走路端を右クリックして
// 表示される緯度・経度に差し替えると正確になる．滑走路の真方位は約330°．
const STARTS = {
  air: { lat: 35.525, lon: 139.815, h: 600, heading: 330, ...AC.airStart, gear: 0, onGround: false },
  runway: { lat: 35.5405, lon: 139.8035, heading: 330, speed: 0, throttle: 0, gear: 1, onGround: true },
};
const start = { ...(STARTS[CONFIG.START] ?? STARTS.air), ...(CONFIG.START_OVERRIDE ?? {}) };

const PHYS_DT = 1 / 240;          // 物理の固定時間刻み
const GROUND_SAMPLE_EVERY = 4;    // 何フレームごとに地面の高さを測るか

// ---------- 起動 ----------
if (!CONFIG.GOOGLE_MAPS_API_KEY) {
  showMessage('APIキーが設定されていません',
    'config.js の GOOGLE_MAPS_API_KEY に，Map Tiles API を有効にしたGoogle CloudのAPIキーを入れてから再読み込みしてください．');
  throw new Error('No API key');
}

const viewer = new Cesium.Viewer('cesium', {
  globe: false,
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  skyAtmosphere: new Cesium.SkyAtmosphere(),
});
const scene = viewer.scene;
scene.screenSpaceCameraController.enableInputs = false;
scene.camera.frustum.near = 0.5;

// 太陽の位置を日本時間の昼（正午前後）に固定する．夜に遊んでも機体が暗くならないように．
viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(CONFIG.SUN_TIME ?? '2026-05-15T02:30:00Z');
viewer.clock.shouldAnimate = true;   // パーティクル（爆発・煙）は時計の進みで動くので止めない

let tileset;
try {
  Cesium.GoogleMaps.defaultApiKey = CONFIG.GOOGLE_MAPS_API_KEY;
  tileset = await Cesium.createGooglePhotorealistic3DTileset();
  tileset.maximumScreenSpaceError = CONFIG.TILE_QUALITY ?? 16;
  scene.primitives.add(tileset);
} catch (e) {
  showMessage('3Dタイルを読み込めませんでした',
    'APIキーが正しいか，Google Cloud で Map Tiles API が有効になっているか確認してください．詳細はブラウザのコンソールに出ています．');
  throw e;
}

// ---------- 機体の3Dモデル ----------
// ・CONFIG.MODEL.url が指定されていれば，そのglTF/GLBを読み込む（自分で入手したモデル用）
// ・なければ model.js でオリジナル外観のモデルを生成する
const userModel = CONFIG.MODEL?.url ? CONFIG.MODEL : null;
let model;
let modelFix;      // 機体軸 → モデル座標 の補正行列
let gearNode = null;
try {
  if (userModel) {
    model = await Cesium.Model.fromGltfAsync({ url: userModel.url });
    // glTF標準（+Y上，+Z前）を Cesium が x前・y左・z上 に変換したうえで，
    // 機体ごとの向き・位置・大きさのずれを config で補正する
    const hpr = new Cesium.HeadingPitchRoll(
      (userModel.yawDeg ?? 0) * DEG, (userModel.pitchDeg ?? 0) * DEG, (userModel.rollDeg ?? 0) * DEG);
    const rot = Cesium.Matrix4.fromRotation(Cesium.Matrix3.fromHeadingPitchRoll(hpr));
    const scl = Cesium.Matrix4.fromUniformScale(userModel.scale ?? 1);
    const off = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(...(userModel.offset ?? [0, 0, 0])));
    modelFix = Cesium.Matrix4.multiply(off, Cesium.Matrix4.multiply(FLIP(), Cesium.Matrix4.multiply(rot, scl, new Cesium.Matrix4()), new Cesium.Matrix4()), new Cesium.Matrix4());
  } else {
    const glb = buildAircraftGLB(AC);
    const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    model = await Cesium.Model.fromGltfAsync({ url, upAxis: Cesium.Axis.Z, forwardAxis: Cesium.Axis.X });
    modelFix = FLIP();
  }
  scene.primitives.add(model);
  model.readyEvent.addEventListener(() => {
    try { gearNode = model.getNode('gear') ?? null; } catch { gearNode = null; }
  });
} catch (e) {
  console.error(e);
  showMessage('機体モデルを読み込めませんでした',
    userModel ? `config.js の MODEL.url（${userModel.url}）のファイルが存在するか確認してください．` : '詳細はブラウザのコンソールに出ています．');
  throw e;
}

// 機体軸（x前，y右，z下）→ Cesiumモデル座標（x前，y左，z上）
function FLIP() {
  return Cesium.Matrix4.fromRotation(new Cesium.Matrix3(1, 0, 0, 0, -1, 0, 0, 0, -1));
}

function placeAircraft(bodyToWorld, visible, gearDown) {
  model.modelMatrix = Cesium.Matrix4.multiply(bodyToWorld, modelFix, new Cesium.Matrix4());
  model.show = visible;
  if (gearNode) gearNode.show = !!gearDown;
}

// ---------- 座標変換 ----------
// 機体軸 → ECEF の回転行列（Cesium.Matrix3）
function bodyToEcef(latRad, lonRad, C) {
  const sl = Math.sin(latRad), cl = Math.cos(latRad);
  const so = Math.sin(lonRad), co = Math.cos(lonRad);
  const N = [-sl * co, -sl * so, cl];
  const E = [-so, co, 0];
  const D = [-cl * co, -cl * so, -sl];
  const ax = (i) => [0, 1, 2].map((r) => C[0][i] * N[r] + C[1][i] * E[r] + C[2][i] * D[r]);
  const x = ax(0), y = ax(1), z = ax(2);
  return new Cesium.Matrix3(
    x[0], y[0], z[0],
    x[1], y[1], z[1],
    x[2], y[2], z[2],
  );
}
const bodyVec = (R, v) => Cesium.Matrix3.multiplyByVector(R, new Cesium.Cartesian3(...v), new Cesium.Cartesian3());

// ---------- シミュレーション ----------
const fdm = new FlightModel(AC);
const controls = new Controls(CONFIG.STICK_MODE ?? 'hold', CONFIG.INPUT_MODE ?? 'keyboard', {
  mouseRange: CONFIG.MOUSE_RANGE ?? 0.3,
  invertMouseY: CONFIG.MOUSE_INVERT_Y ?? false,
});
const explosion = new Explosion(viewer);
const autopilot = new Autopilot();
const cockpit = new Cockpit($('cockpit'), controls, { visible: CONFIG.COCKPIT_PANEL ?? true });
cockpit.onAction = (a) => controls.onAction(a);
const hud = new Hud($('hud'));

let phase = 'loading';      // loading → flying
let paused = false;
let cameraMode = 'chase';   // chase | cockpit
let groundH = null;
let groundAt = null;        // 最後に地面高を測れた地点
let frame = 0;
let acc = 0;
let lastT = performance.now();
let loadT = 0;
let crash = null;           // 墜落時の演出状態 { t, pos, eye }

controls.onAction = (a) => {
  if (a === 'camera') cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (a === 'reset') beginLoading();
  if (a === 'pause' && phase === 'flying') paused = !paused;
  if (a === 'help') $('help').hidden = !$('help').hidden;
  if (a === 'panel') cockpit.toggle();
  if (a === 'ap') autopilot.setActive(controls.ctl.ap);
};

function beginLoading() {
  phase = 'loading';
  groundH = null;
  groundAt = null;
  model.show = false;
  explosion.clear();
  crash = null;
  $('overlay').hidden = true;
  $('loading').hidden = false;
  scene.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, 1500),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });
  loadT = performance.now();
}

function tryStart() {
  const waited = performance.now() - loadT;
  const ready = tileset.tilesLoaded || waited > 12000;
  if (!ready || waited < 1500) return;

  const h = sample(start.lat, start.lon);
  if (start.onGround && h === undefined) {
    if (waited < 20000) return;
    showMessage('地面の高さを取得できませんでした', 'R キーで再試行してください．');
    return;
  }

  let startH = start.h;
  if (start.onGround) startH = h + GEAR_H;
  else if (h !== undefined) startH = Math.max(start.h, h + 150);

  fdm.reset({ ...start, h: startH });
  Object.assign(controls.ctl, {
    throttle: start.throttle, gear: start.gear, flaps: start.onGround ? 1 : 0,
    trim: 0, elevator: 0, aileron: 0, rudder: 0,
  });
  groundH = h ?? null;
  groundAt = h !== undefined ? [start.lat, start.lon] : null;
  phase = 'flying';
  paused = false;
  $('loading').hidden = true;
}

function sample(latDeg, lonDeg) {
  if (!scene.sampleHeightSupported) return undefined;
  return scene.sampleHeight(Cesium.Cartographic.fromDegrees(lonDeg, latDeg), [model]);
}

function updateGround(st) {
  if (frame % GROUND_SAMPLE_EVERY) return;
  const h = sample(st.latDeg, st.lonDeg);
  if (h !== undefined) {
    groundH = h;
    groundAt = [st.latDeg, st.lonDeg];
  } else if (groundAt) {
    // 測れない状態で200m以上動いたら古い値は捨てる
    const dN = (st.latDeg - groundAt[0]) * 111000;
    const dE = (st.lonDeg - groundAt[1]) * 111000 * Math.cos(st.latDeg * DEG);
    if (Math.hypot(dN, dE) > 200) { groundH = null; groundAt = null; }
  }
}

scene.preUpdate.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  frame++;

  if (phase === 'loading') { tryStart(); hud.draw({}, controls.ctl, {}); return; }

  const ctl = controls.update(dt);
  let st = fdm.state;

  if (!paused && !fdm.crashed) {
    if (ctl.ap) autopilot.update(st, ctl, dt);
    updateGround(st);
    acc += dt;
    while (acc >= PHYS_DT) {
      fdm.step(PHYS_DT, ctl, groundH);
      acc -= PHYS_DT;
    }
    st = fdm.state;
  }

  $('paused').hidden = !paused;

  if (fdm.crashed) { crashFrame(st); return; }

  // --- 機体の姿勢を描画に反映 ---
  const pos = Cesium.Cartesian3.fromDegrees(st.lonDeg, st.latDeg, st.h);
  const R = bodyToEcef(fdm.lat, fdm.lon, st.C);
  placeAircraft(Cesium.Matrix4.fromRotationTranslation(R, pos), cameraMode !== 'cockpit', ctl.gear);

  // --- カメラ ---
  const up = bodyVec(R, [0, 0, -1]);
  if (cameraMode === 'cockpit') {
    const eye = Cesium.Cartesian3.add(pos, bodyVec(R, AC.cockpitEye), new Cesium.Cartesian3());
    scene.camera.setView({ destination: eye, orientation: { direction: bodyVec(R, [1, 0, 0]), up } });
  } else {
    const eye = Cesium.Cartesian3.add(pos, bodyVec(R, AC.chaseEye), new Cesium.Cartesian3());
    const target = Cesium.Cartesian3.add(pos, bodyVec(R, AC.chaseLook), new Cesium.Cartesian3());
    const dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(target, eye, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    scene.camera.setView({ destination: eye, orientation: { direction: dir, up } });
  }

  // --- HUD ---
  const fr = scene.camera.frustum;
  const aspect = hud.w / hud.h;
  const vfov = aspect > 1 ? 2 * Math.atan(Math.tan(fr.fov / 2) / aspect) : fr.fov;
  const agl = groundH == null ? null : st.h - groundH - (GEAR_H - 0.25);
  hud.draw(st, controls.ctl, {
    vfov,
    cockpit: cameraMode === 'cockpit',
    agl,
    thrustRatio: fdm.engineThrust / AC.thrustMaxSL,
    stickMode: controls.stickMode,
    inputMode: controls.inputMode,
    mouse: controls.mouse,
    mouseRange: controls.mouseRange,
    invertMouseY: controls.invertMouseY,
    panelVisible: cockpit.visible,
    flapName: FLAP_STEPS[ctl.flapPos].name,
  });

  cockpit.update(st, {
    agl,
    thrustRatio: fdm.engineThrust / AC.thrustMaxSL,
    flapName: FLAP_STEPS[ctl.flapPos].name,
    engineCount: AC.engineCount,
    apHdg: ctl.ap ? ctl.apTarget.hdg : null,
  });
});

// 墜落した瞬間に爆発を起こし，その場を少し離れた位置から見せる
function crashFrame(st) {
  if (!crash) {
    const pos = Cesium.Cartesian3.fromDegrees(st.lonDeg, st.latDeg, st.h);
    const R = bodyToEcef(fdm.lat, fdm.lon, st.C);
    // 追従カメラの位置から少し上へ引いた地点で固定
    const back = bodyVec(R, AC.chaseEye);
    const up = Cesium.Cartesian3.normalize(pos, new Cesium.Cartesian3());
    const eye = Cesium.Cartesian3.add(pos, Cesium.Cartesian3.multiplyByScalar(back, 1.6, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    Cesium.Cartesian3.add(eye, Cesium.Cartesian3.multiplyByScalar(up, AC.b * 0.8, new Cesium.Cartesian3()), eye);
    crash = { t: performance.now(), pos, eye, up };
    model.show = false;
    explosion.trigger(pos, AC.b, CONFIG.SOUND ?? true);
  }
  const t = (performance.now() - crash.t) / 1000;
  // 爆発直後の揺れ
  const shake = Math.max(0, 1 - t / 1.2) * AC.b * 0.03;
  const jitter = new Cesium.Cartesian3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const eye = Cesium.Cartesian3.add(crash.eye, jitter, new Cesium.Cartesian3());
  const dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(crash.pos, eye, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const right = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(dir, crash.up, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const up = Cesium.Cartesian3.cross(right, dir, new Cesium.Cartesian3());
  scene.camera.setView({ destination: eye, orientation: { direction: dir, up } });
  hud.draw({}, controls.ctl, {});
  if (t > 2.5 && $('overlay').hidden) {
    showMessage('墜落しました', `${fdm.crashReason}．R キーで開始地点からやり直せます．`);
  }
}

beginLoading();

function showMessage(title, body) {
  $('overlay-title').textContent = title;
  $('overlay-body').textContent = body;
  $('overlay').hidden = false;
  $('loading').hidden = true;
}
