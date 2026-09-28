// 墜落時の爆発演出
//  - 火球（膨らみながら消える球）
//  - 炎と破片のパーティクル（破片は重力で落ちる）
//  - 立ちのぼる黒煙（しばらく残る）
//  - 爆発音（Web Audio で合成．音声ファイル不要）
// 大きさは機体の翼幅に合わせて拡大縮小する．

const Cesium = window.Cesium;

// パーティクル用の画像をキャンバスで作る（外部ファイル不要）
function radialSprite(inner, outer, soft = 0.5) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(soft, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}
const FIRE = radialSprite('rgba(255,250,220,1)', 'rgba(255,120,20,0.8)', 0.45);
const SMOKE = radialSprite('rgba(40,38,36,0.9)', 'rgba(30,30,30,0.5)', 0.6);
const DEBRIS = radialSprite('rgba(20,20,20,1)', 'rgba(20,20,20,1)', 0.8);

export class Explosion {
  constructor(viewer) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.items = [];
    this.audio = null;
  }

  // position: Cartesian3（ECEF），size: 翼幅 m
  trigger(position, size, withSound = true) {
    this.clear();
    const s = size / 15;                 // 小型ジェットを1とした倍率
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const up = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
    const t0 = performance.now();

    // --- 火球 ---
    const fireball = this.viewer.entities.add({
      position,
      ellipsoid: {
        radii: new Cesium.CallbackProperty(() => {
          const t = (performance.now() - t0) / 1000;
          const r = s * 14 * (1 - Math.exp(-t * 4)) + 0.1;
          return new Cesium.Cartesian3(r, r, r * 0.8);
        }, false),
        material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(() => {
          const t = (performance.now() - t0) / 1000;
          const a = Math.max(0, 0.9 - t * 0.55);
          const heat = Math.max(0, 1 - t * 0.8);
          return new Cesium.Color(1, 0.35 + 0.5 * heat, 0.1 * heat, a);
        }, false)),
      },
    });
    this.items.push({ entity: fireball });

    // --- 炎の塊（一瞬で大量に） ---
    this.addPS({
      image: FIRE,
      startColor: new Cesium.Color(1, 0.9, 0.6, 1),
      endColor: new Cesium.Color(0.8, 0.2, 0.05, 0),
      startScale: 1, endScale: 3,
      minimumParticleLife: 0.8, maximumParticleLife: 2.2,
      minimumSpeed: 6 * s, maximumSpeed: 22 * s,
      imageSize: new Cesium.Cartesian2(9 * s, 9 * s),
      emissionRate: 0,
      bursts: [new Cesium.ParticleBurst({ time: 0, minimum: 120, maximum: 160 })],
      lifetime: 3, loop: false,
      emitter: new Cesium.SphereEmitter(3 * s),
      modelMatrix: enu,
      sizeInMeters: true,
    });

    // --- 破片（放物線を描いて落ちる） ---
    this.addPS({
      image: DEBRIS,
      startColor: Cesium.Color.BLACK, endColor: Cesium.Color.BLACK.withAlpha(0.6),
      startScale: 1, endScale: 1,
      minimumParticleLife: 2.5, maximumParticleLife: 5,
      minimumSpeed: 20 * Math.sqrt(s), maximumSpeed: 55 * Math.sqrt(s),
      imageSize: new Cesium.Cartesian2(0.9 * s, 0.9 * s),
      emissionRate: 0,
      bursts: [new Cesium.ParticleBurst({ time: 0, minimum: 60, maximum: 90 })],
      lifetime: 6, loop: false,
      emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(70)),
      modelMatrix: enu,
      sizeInMeters: true,
      updateCallback: (p, dt) => {
        const g = Cesium.Cartesian3.multiplyByScalar(up, -9.8 * dt, new Cesium.Cartesian3());
        Cesium.Cartesian3.add(p.velocity, g, p.velocity);
      },
    });

    // --- 黒煙（長く立ちのぼる） ---
    this.addPS({
      image: SMOKE,
      startColor: new Cesium.Color(0.15, 0.14, 0.13, 0.75),
      endColor: new Cesium.Color(0.35, 0.35, 0.35, 0),
      startScale: 1, endScale: 6,
      minimumParticleLife: 5, maximumParticleLife: 9,
      minimumSpeed: 4 * Math.sqrt(s), maximumSpeed: 9 * Math.sqrt(s),
      imageSize: new Cesium.Cartesian2(7 * s, 7 * s),
      emissionRate: 14,
      lifetime: 30, loop: false,
      emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(18)),
      modelMatrix: enu,
      sizeInMeters: true,
    });

    // --- 残り火 ---
    this.addPS({
      image: FIRE,
      startColor: new Cesium.Color(1, 0.6, 0.15, 0.9),
      endColor: new Cesium.Color(0.6, 0.1, 0.0, 0),
      startScale: 1, endScale: 0.3,
      minimumParticleLife: 0.6, maximumParticleLife: 1.4,
      minimumSpeed: 2 * Math.sqrt(s), maximumSpeed: 5 * Math.sqrt(s),
      imageSize: new Cesium.Cartesian2(4 * s, 4 * s),
      emissionRate: 25,
      lifetime: 25, loop: false,
      emitter: new Cesium.CircleEmitter(4 * s),
      modelMatrix: enu,
      sizeInMeters: true,
    });

    if (withSound) this.boom(Math.min(1, 0.4 + s * 0.12));
  }

  addPS(opts) {
    const ps = this.scene.primitives.add(new Cesium.ParticleSystem(opts));
    this.items.push({ ps });
  }

  clear() {
    for (const it of this.items) {
      if (it.entity) this.viewer.entities.remove(it.entity);
      if (it.ps) this.scene.primitives.remove(it.ps);
    }
    this.items = [];
  }

  // ホワイトノイズ＋低音で爆発音を合成
  boom(gainLevel) {
    try {
      this.audio ??= new (window.AudioContext || window.webkitAudioContext)();
      const ac = this.audio;
      if (ac.state === 'suspended') ac.resume();
      const now = ac.currentTime;
      const len = 3;
      const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2500, now);
      lp.frequency.exponentialRampToValueAtTime(150, now + len);
      const ng = ac.createGain();
      ng.gain.setValueAtTime(gainLevel, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + len);
      noise.connect(lp).connect(ng).connect(ac.destination);

      const thump = ac.createOscillator();
      thump.frequency.setValueAtTime(90, now);
      thump.frequency.exponentialRampToValueAtTime(30, now + 0.8);
      const tg = ac.createGain();
      tg.gain.setValueAtTime(gainLevel, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      thump.connect(tg).connect(ac.destination);

      noise.start(now); noise.stop(now + len);
      thump.start(now); thump.stop(now + 1.0);
    } catch (e) {
      console.warn('sound unavailable', e);
    }
  }
}
