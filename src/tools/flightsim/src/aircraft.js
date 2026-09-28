// 機体パラメータ．機体軸は x前方，y右翼，z下方．
// 空力係数は教科書・公開文献でよく使われる大型機／小型ジェットの代表値をもとにした近似値で，
// 特定の機種を正確に再現したものではない．

const DEG = Math.PI / 180;

// ---------------------------------------------------------------
// 超大型4発機（A380級の重量・寸法・推力に合わせた汎用モデル）
//   公表値の目安：翼幅約80 m，翼面積約845 m²，最大離陸重量約575 t，
//   エンジン1基あたり推力約310〜350 kN
// ---------------------------------------------------------------
export const AIRLINER = {
  name: '超大型旅客機（A380級）',

  mass: 400000,           // kg（中程度の搭載状態）
  Ixx: 4.2e7,             // kg m^2
  Iyy: 7.6e7,
  Izz: 1.15e8,

  S: 845, b: 79.75, c: 11.5,

  thrustMaxSL: 1.3e6,     // 4基合計 N
  thrustDensityExp: 0.75,
  engineTau: 3.0,

  deMax: 25 * DEG, daMax: 20 * DEG, drMax: 30 * DEG,

  CL0: 0.25, CLa: 5.7, CLde: 0.34, CLq: 5.1,
  alphaStall: 13 * DEG,
  flapCL: 0.6,

  CD0: 0.020, k: 0.045, flapCD: 0.05, gearCD: 0.02,

  CYb: -0.9, CYdr: 0.12,

  Clb: -0.10, Clp: -0.45, Clr: 0.10, Clda: 0.13, Cldr: 0.007,
  Cm0: 0.055, Cma: -1.26, Cmq: -20.7, Cmde: -1.34, flapCm: -0.10,
  Cnb: 0.15, Cnp: -0.12, Cnr: -0.28, Cnda: 0.006, Cndr: -0.11,

  // 降着装置：r は重心からの接地点（m），k ばね定数，c 減衰係数
  gear: [
    { r: [28, 0, 6.0], k: 1.2e6, c: 2.5e5, steer: true, brake: false },
    { r: [-2, -6, 6.0], k: 7.0e6, c: 1.4e6, steer: false, brake: true },
    { r: [-2, 6, 6.0], k: 7.0e6, c: 1.4e6, steer: false, brake: true },
  ],
  muRoll: 0.015, muBrake: 0.45, muLat: 0.7, latK: 0.5, steerMax: 0.5,

  // 墜落判定
  crash: { maxPen: 1.0, rollDeg: 8, pitchUpDeg: 11, pitchDownDeg: -4, bellyClearance: 3.2 },

  engineCount: 4,
  airStart: { speed: 128, throttle: 0.2 },

  // カメラ位置（機体軸）
  cockpitEye: [29.5, 0, -2.2],
  chaseEye: [-160, 0, -38],
  chaseLook: [30, 0, 0],

  // オリジナル外観の寸法（model.js 用）
  visual: {
    length: 72, noseX: 33, radius: 3.55, heightRatio: 1.08,
    wing: { rootX: 9, rootChord: 17, tipChord: 4.0, span: 39.9, sweep: 33, dihedral: 5, z: -2.2, thick: 0.12 },
    htail: { rootX: -30, rootChord: 8.5, tipChord: 3.2, span: 15, sweep: 35, dihedral: 6, z: 0.8, thick: 0.10 },
    vtail: { rootX: -26, rootChord: 13, tipChord: 4.5, span: 15, sweep: 40, thick: 0.10 },
    engines: [{ x: 10, y: 12.5, z: -4.6 }, { x: 4, y: 24, z: -3.2 }],   // 左右対称に配置
    engineRadius: 1.9, engineLength: 7.5,
    wheelRadius: 0.65,
    windows: { x0: 24, x1: -24, pitch: 0.6, w: 0.28, h: 0.42 },
  },
};

// ---------------------------------------------------------------
// 小型双発ジェット（練習機〜ビジネスジェット級）
// ---------------------------------------------------------------
export const SMALLJET = {
  name: '小型ジェット',

  mass: 12000, Ixx: 25000, Iyy: 120000, Izz: 140000,
  S: 50, b: 15, c: 3.5,

  thrustMaxSL: 100000, thrustDensityExp: 0.7, engineTau: 1.5,

  deMax: 20 * DEG, daMax: 20 * DEG, drMax: 25 * DEG,

  CL0: 0.20, CLa: 5.0, CLde: 0.40, CLq: 6.0,
  alphaStall: 14 * DEG, flapCL: 0.35,
  CD0: 0.022, k: 0.060, flapCD: 0.030, gearCD: 0.015,
  CYb: -0.8, CYdr: 0.15,
  Clb: -0.08, Clp: -0.45, Clr: 0.10, Clda: 0.12, Cldr: 0.01,
  Cm0: 0.02, Cma: -0.70, Cmq: -15.0, Cmde: -1.10, flapCm: -0.03,
  Cnb: 0.12, Cnp: -0.03, Cnr: -0.25, Cnda: -0.005, Cndr: -0.08,

  gear: [
    { r: [5.0, 0.0, 2.0], k: 200000, c: 30000, steer: true, brake: false },
    { r: [-1.0, -2.0, 2.0], k: 200000, c: 30000, steer: false, brake: true },
    { r: [-1.0, 2.0, 2.0], k: 200000, c: 30000, steer: false, brake: true },
  ],
  muRoll: 0.02, muBrake: 0.5, muLat: 0.7, latK: 0.5, steerMax: 0.4,

  crash: { maxPen: 1.2, rollDeg: 25, pitchUpDeg: 15, pitchDownDeg: -8, bellyClearance: 0.9 },

  engineCount: 2,
  airStart: { speed: 125, throttle: 0.2 },

  cockpitEye: [6.2, 0, -1.3],
  chaseEye: [-42, 0, -9],
  chaseLook: [15, 0, 0],

  visual: {
    length: 16, noseX: 7.5, radius: 0.95, heightRatio: 1.05,
    wing: { rootX: 1.2, rootChord: 3.6, tipChord: 1.3, span: 7.5, sweep: 25, dihedral: 4, z: -0.5, thick: 0.11 },
    htail: { rootX: -6.2, rootChord: 1.9, tipChord: 0.9, span: 3.0, sweep: 30, dihedral: 3, z: 0.2, thick: 0.09 },
    vtail: { rootX: -5.4, rootChord: 2.8, tipChord: 1.2, span: 3.0, sweep: 40, thick: 0.09 },
    engines: [{ x: 1.2, y: 3.2, z: -1.1 }],
    engineRadius: 0.5, engineLength: 2.4,
    wheelRadius: 0.3,
    windows: { x0: 4.5, x1: 0.5, pitch: 0.7, w: 0.3, h: 0.35 },
  },
};

export const AIRCRAFT_TYPES = { airliner: AIRLINER, jet: SMALLJET };
