// コックピットの計器パネル
//  上段：PFD（姿勢・速度・高度・昇降計）／ND（方位）／エンジン計器
//  下段：操作パネル（ギア，フラップ，パーキングブレーキ，自動操縦，ライト，トリム）
// 計器はキャンバスに描画し，スイッチ類は実際にクリックできるHTML要素．

const DEG = Math.PI / 180;
const G = '#9fe8c0';           // 計器の基本色


export class Cockpit {
  constructor(root, controls, opts = {}) {
    this.controls = controls;
    this.visible = opts.visible ?? true;
    this.onAction = () => {};
    this.build(root);
    this.bind();
  }

  build(root) {
    root.innerHTML = `
      <div class="cp-screens">
        <canvas class="cp-canvas" data-inst="pfd"></canvas>
        <canvas class="cp-canvas" data-inst="nd"></canvas>
        <canvas class="cp-canvas" data-inst="eng"></canvas>
      </div>
      <div class="cp-panel">
        <div class="cp-group">
          <span class="cp-label">GEAR</span>
          <button class="cp-lever" data-act="gear"><span></span></button>
        </div>
        <div class="cp-group">
          <span class="cp-label">FLAPS</span>
          <div class="cp-flaps">
            <button class="cp-step" data-act="flapUp">▲</button>
            <output class="cp-readout" data-out="flaps">UP</output>
            <button class="cp-step" data-act="flapDown">▼</button>
          </div>
        </div>
        <div class="cp-group">
          <span class="cp-label">BRAKE</span>
          <button class="cp-sw" data-act="park">PARK</button>
        </div>
        <div class="cp-group">
          <span class="cp-label">TRIM</span>
          <div class="cp-flaps">
            <button class="cp-step" data-act="trimUp">▲</button>
            <output class="cp-readout" data-out="trim">+0.00</output>
            <button class="cp-step" data-act="trimDown">▼</button>
          </div>
        </div>
        <div class="cp-group cp-ap">
          <span class="cp-label">AUTOPILOT</span>
          <div class="cp-aprow">
            <button class="cp-sw" data-act="ap">A/P</button>
            <label class="cp-field">ALT <input type="number" data-in="alt" step="500" min="0" max="45000"></label>
            <label class="cp-field">HDG <input type="number" data-in="hdg" step="5" min="0" max="359"></label>
            <label class="cp-field">SPD <input type="number" data-in="spd" step="10" min="80" max="400"></label>
          </div>
        </div>
        <div class="cp-group">
          <span class="cp-label">LIGHTS</span>
          <div class="cp-lights">
            <button class="cp-sw cp-sm" data-act="landing">LAND</button>
            <button class="cp-sw cp-sm" data-act="beacon">BCN</button>
            <button class="cp-sw cp-sm" data-act="strobe">STRB</button>
          </div>
        </div>
        <div class="cp-group">
          <span class="cp-label">VIEW</span>
          <div class="cp-lights">
            <button class="cp-sw cp-sm" data-act="view">切替</button>
            <button class="cp-sw cp-sm" data-act="center">中立</button>
          </div>
        </div>
      </div>`;
    this.root = root;
    this.canvases = {};
    for (const c of root.querySelectorAll('.cp-canvas')) this.canvases[c.dataset.inst] = c;
    this.outs = {};
    for (const o of root.querySelectorAll('[data-out]')) this.outs[o.dataset.out] = o;
    this.inputs = {};
    for (const i of root.querySelectorAll('[data-in]')) this.inputs[i.dataset.in] = i;
    this.inputs.alt.value = 3000;
    root.hidden = !this.visible;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    for (const c of Object.values(this.canvases)) {
      const r = c.getBoundingClientRect();
      if (!r.width) continue;
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      c._w = r.width; c._h = r.height;
    }
  }

  bind() {
    const c = this.controls.ctl;
    this.root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      e.preventDefault();
      switch (b.dataset.act) {
        case 'gear': c.gear = c.gear ? 0 : 1; break;
        case 'flapDown': this.controls.setFlaps(c.flapPos + 1); break;
        case 'flapUp': this.controls.setFlaps(c.flapPos - 1); break;
        case 'park': c.parkBrake = !c.parkBrake; break;
        case 'trimUp': c.trim = Math.min(0.5, c.trim + 0.02); break;
        case 'trimDown': c.trim = Math.max(-0.5, c.trim - 0.02); break;
        case 'ap': c.ap = !c.ap; this.onAction('ap'); break;
        case 'landing': c.lights.landing = !c.lights.landing; break;
        case 'beacon': c.lights.beacon = !c.lights.beacon; break;
        case 'strobe': c.lights.strobe = !c.lights.strobe; break;
        case 'view': this.onAction('camera'); break;
        case 'center': c.elevator = 0; c.aileron = 0; c.rudder = 0; break;
      }
    });
    // 数値入力にフォーカスしたままだとキー操作が効かなくなるので，確定したら外す
    for (const i of Object.values(this.inputs)) {
      i.addEventListener('change', () => this.readTargets());
      i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
    }
    // パネル上のドラッグで機体が動かないように
    this.root.addEventListener('pointermove', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());
  }

  readTargets() {
    const t = this.controls.ctl.apTarget;
    const num = (el) => (el.value === '' ? null : Number(el.value));
    t.alt = num(this.inputs.alt) ?? t.alt;
    t.hdg = num(this.inputs.hdg);
    t.spd = num(this.inputs.spd);
  }

  toggle() {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
    if (this.visible) this.resize();
  }

  // ---------- 毎フレームの更新 ----------
  update(st, opt) {
    if (!this.visible || st.V == null) return;
    const c = this.controls.ctl;
    this.setSwitch('gear', c.gear);
    this.setSwitch('park', c.parkBrake);
    this.setSwitch('ap', c.ap);
    this.setSwitch('landing', c.lights.landing);
    this.setSwitch('beacon', c.lights.beacon);
    this.setSwitch('strobe', c.lights.strobe);
    this.outs.flaps.textContent = opt.flapName;
    this.outs.trim.textContent = (c.trim >= 0 ? '+' : '') + c.trim.toFixed(2);
    this.drawPFD(st, c, opt);
    this.drawND(st, opt);
    this.drawENG(st, c, opt);
  }

  setSwitch(act, on) {
    const el = this.root.querySelector(`[data-act="${act}"]`);
    if (el) el.classList.toggle('on', !!on);
  }

  ctx(name) {
    const c = this.canvases[name];
    const g = c.getContext('2d');
    g.clearRect(0, 0, c._w, c._h);
    g.font = '11px "B612 Mono", monospace';
    g.textBaseline = 'middle';
    return { g, W: c._w, H: c._h };
  }

  // ---- 姿勢儀＋速度・高度テープ ----
  drawPFD(st, ctl, opt) {
    const { g, W, H } = this.ctx('pfd');
    const cx = W * 0.5, cy = H * 0.47;
    const R = Math.min(W * 0.28, H * 0.36);
    const { pitch, roll, heading } = st.euler;
    const pxPerDeg = R / 22;

    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy); g.rotate(-roll); g.translate(0, pitch * pxPerDeg);
    // 空と地面
    g.fillStyle = '#2f6fa8'; g.fillRect(-R * 3, -R * 6, R * 6, R * 6);
    g.fillStyle = '#6b4a2a'; g.fillRect(-R * 3, 0, R * 6, R * 6);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-R * 3, 0); g.lineTo(R * 3, 0); g.stroke();
    // ピッチ目盛
    g.lineWidth = 1; g.fillStyle = '#fff'; g.textAlign = 'center';
    for (let d = -30; d <= 30; d += 5) {
      if (!d) continue;
      const y = -d * pxPerDeg;
      const half = d % 10 === 0 ? R * 0.34 : R * 0.16;
      g.beginPath(); g.moveTo(-half, y); g.lineTo(half, y); g.stroke();
      if (d % 10 === 0) {
        g.fillText(Math.abs(d), -half - 12, y);
        g.fillText(Math.abs(d), half + 12, y);
      }
    }
    g.restore();

    // バンク角指標
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = '#fff'; g.lineWidth = 1.2;
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const r0 = R, r1 = R - (a % 30 === 0 ? 10 : 6);
      const th = (-90 + a) * DEG;
      g.beginPath();
      g.moveTo(Math.cos(th) * r0, Math.sin(th) * r0);
      g.lineTo(Math.cos(th) * r1, Math.sin(th) * r1);
      g.stroke();
    }
    g.rotate(-roll);
    g.fillStyle = Math.abs(roll) > 35 * DEG ? '#ffc65c' : '#fff';
    g.beginPath(); g.moveTo(0, -R); g.lineTo(-7, -R + 12); g.lineTo(7, -R + 12); g.closePath(); g.fill();
    g.restore();

    // 機体シンボル
    g.strokeStyle = '#ffd24a'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - R * 0.5, cy); g.lineTo(cx - R * 0.16, cy); g.lineTo(cx - R * 0.16, cy + R * 0.1);
    g.moveTo(cx + R * 0.5, cy); g.lineTo(cx + R * 0.16, cy); g.lineTo(cx + R * 0.16, cy + R * 0.1);
    g.stroke();
    g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2); g.fillStyle = '#ffd24a'; g.fill();

    // 速度・高度テープ
    this.tape(g, W * 0.13, cy, H, st.V * 1.94384, 10, 'left');
    this.tape(g, W * 0.87, cy, H, st.h * 3.28084, 100, 'right');

    // 昇降計
    const vs = -st.vNed[2] * 196.85;
    g.strokeStyle = G; g.fillStyle = G; g.lineWidth = 1;
    const vx = W * 0.955, vh = H * 0.34;
    g.beginPath(); g.moveTo(vx, cy - vh); g.lineTo(vx, cy + vh); g.stroke();
    const vy = cy - Math.max(-1, Math.min(1, vs / 3000)) * vh;
    g.beginPath(); g.moveTo(vx - 6, vy); g.lineTo(vx + 4, vy); g.stroke();
    g.textAlign = 'right';
    g.fillText(Math.abs(vs) > 50 ? (vs > 0 ? '+' : '') + Math.round(vs / 50) * 50 : '0', vx - 4, cy - vh - 8);

    // 方位
    g.textAlign = 'center';
    g.fillStyle = G;
    g.font = '12px "B612 Mono", monospace';
    const hdg = ((heading / DEG) + 360) % 360;
    g.fillText(String(Math.round(hdg) % 360).padStart(3, '0') + '°', cx, H - 12);

    // 迎角と荷重倍数
    g.textAlign = 'left';
    g.fillStyle = Math.abs(st.alpha) > 12 * DEG ? '#ff7b6b' : G;
    g.fillText('α ' + (st.alpha / DEG).toFixed(1) + '°', 6, H - 12);
    g.textAlign = 'right';
    g.fillStyle = G;
    g.fillText('G ' + st.nz.toFixed(1), W - 6, H - 12);
  }

  tape(g, x, cy, H, value, step, side) {
    const span = H * 0.36, pxPer = span / (step * 5);
    const dir = side === 'left' ? -1 : 1;
    g.save();
    g.beginPath(); g.rect(x - 34, cy - span, 68, span * 2); g.clip();
    g.strokeStyle = G; g.fillStyle = G; g.lineWidth = 1;
    g.textAlign = side === 'left' ? 'right' : 'left';
    const base = Math.floor(value / step) * step;
    for (let v = base - step * 6; v <= base + step * 6; v += step) {
      const y = cy - (v - value) * pxPer;
      const major = v % (step * 5) === 0;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + dir * (major ? 9 : 5), y); g.stroke();
      if (major && v >= 0) g.fillText(v, x + dir * 13, y);
    }
    g.beginPath(); g.moveTo(x, cy - span); g.lineTo(x, cy + span); g.stroke();
    g.restore();
    // 現在値
    const bw = 54, bh = 20, bx = side === 'left' ? x - 12 - bw : x + 12;
    g.fillStyle = 'rgba(0,18,10,0.85)'; g.fillRect(bx, cy - bh / 2, bw, bh);
    g.strokeStyle = G; g.strokeRect(bx, cy - bh / 2, bw, bh);
    g.fillStyle = '#eafff2'; g.textAlign = 'center';
    g.font = '13px "B612 Mono", monospace';
    g.fillText(Math.round(value), bx + bw / 2, cy + 1);
    g.font = '11px "B612 Mono", monospace';
  }

  // ---- 方位計 ----
  drawND(st, opt) {
    const { g, W, H } = this.ctx('nd');
    const cx = W / 2, cy = H * 0.56, R = Math.min(W * 0.42, H * 0.42);
    const hdg = ((st.euler.heading / DEG) + 360) % 360;

    g.save();
    g.translate(cx, cy);
    g.strokeStyle = G; g.fillStyle = G; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.rotate(-hdg * DEG);
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = 0; d < 360; d += 10) {
      const th = (d - 90) * DEG;
      const major = d % 30 === 0;
      const r1 = R - (major ? 12 : 6);
      g.beginPath();
      g.moveTo(Math.cos(th) * R, Math.sin(th) * R);
      g.lineTo(Math.cos(th) * r1, Math.sin(th) * r1);
      g.stroke();
      if (major) {
        g.save();
        g.translate(Math.cos(th) * (R - 22), Math.sin(th) * (R - 22));
        g.rotate(hdg * DEG);
        g.textAlign = 'center';
        g.fillText(names[d] ?? String(d / 10), 0, 0);
        g.restore();
      }
    }
    // 自動操縦の目標方位
    if (opt.apHdg != null) {
      const th = (opt.apHdg - 90) * DEG;
      g.strokeStyle = '#ff9ee0'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(Math.cos(th) * R, Math.sin(th) * R);
      g.lineTo(Math.cos(th) * (R - 18), Math.sin(th) * (R - 18));
      g.stroke();
    }
    g.restore();

    // 自機シンボルと針
    g.strokeStyle = '#eafff2'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy - R * 0.45); g.lineTo(cx, cy + R * 0.3);
    g.moveTo(cx - R * 0.22, cy); g.lineTo(cx + R * 0.22, cy);
    g.stroke();
    g.fillStyle = '#eafff2';
    g.beginPath(); g.moveTo(cx, cy - R - 3); g.lineTo(cx - 6, cy - R + 9); g.lineTo(cx + 6, cy - R + 9); g.closePath(); g.fill();

    g.fillStyle = G; g.textAlign = 'center';
    g.fillText('HDG ' + String(Math.round(hdg) % 360).padStart(3, '0'), cx, 14);
    g.textAlign = 'left';
    g.fillText('GS ' + Math.round(Math.hypot(st.vNed[0], st.vNed[1]) * 1.94384) + ' kt', 6, H - 10);
    g.textAlign = 'right';
    g.fillText(opt.agl == null ? 'RA ---' : 'RA ' + Math.round(opt.agl * 3.28084), W - 6, H - 10);
  }

  // ---- エンジン・系統 ----
  drawENG(st, ctl, opt) {
    const { g, W, H } = this.ctx('eng');
    const n1 = opt.thrustRatio;
    const cmd = ctl.throttle;

    g.fillStyle = G; g.textAlign = 'center';
    g.fillText('N1 %', W / 2, 12);

    // エンジン4基（または2基）の縦バー
    const n = opt.engineCount;
    const bw = Math.min(26, (W - 24) / n - 8);
    const x0 = W / 2 - (n * (bw + 8) - 8) / 2;
    const top = 24, bot = H * 0.62;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (bw + 8);
      g.strokeStyle = 'rgba(159,232,192,0.5)';
      g.strokeRect(x, top, bw, bot - top);
      const hgt = (bot - top) * n1;
      g.fillStyle = n1 > 0.95 ? '#ffc65c' : '#4fd08a';
      g.fillRect(x + 1, bot - hgt, bw - 2, hgt);
      // 指令値の線
      const cy2 = bot - (bot - top) * cmd;
      g.strokeStyle = '#eafff2'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x - 2, cy2); g.lineTo(x + bw + 2, cy2); g.stroke();
    }
    g.fillStyle = '#eafff2'; g.textAlign = 'center';
    g.font = '13px "B612 Mono", monospace';
    g.fillText(Math.round(n1 * 100) + '%', W / 2, bot + 16);
    g.font = '11px "B612 Mono", monospace';

    // 系統の状態
    const rows = [
      ['THR', Math.round(cmd * 100) + '%', null],
      ['FLAP', opt.flapName, null],
      ['GEAR', ctl.gear ? 'DOWN' : 'UP', ctl.gear ? '#4fd08a' : '#ffc65c'],
      ['BRK', ctl.parkBrake ? 'PARK' : ctl.brake ? 'ON' : 'OFF', ctl.parkBrake || ctl.brake ? '#ffc65c' : null],
      ['A/P', ctl.ap ? 'ON' : 'OFF', ctl.ap ? '#ff9ee0' : null],
      ['MACH', st.mach.toFixed(2), null],
    ];
    let y = bot + 34;
    for (const [a, b, col] of rows) {
      g.fillStyle = G; g.textAlign = 'left'; g.fillText(a, 8, y);
      g.fillStyle = col || '#eafff2'; g.textAlign = 'right'; g.fillText(b, W - 8, y);
      y += 15;
    }
  }
}
