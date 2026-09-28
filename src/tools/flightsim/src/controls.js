// キーボード／ゲームパッド入力
// stickMode:
//   'hold'   … キーを押している間だけ舵が動き，離すとその舵角のまま保持（自動で中立に戻らない）
//   'spring' … 押している間だけ舵が切れ，離すと自動で中立に戻る
// C キーで操縦桿とラダーを中立に戻せる．
//
// inputMode:
//   'keyboard' … 矢印キーで操縦桿
//   'mouse'    … マウスカーソルの位置がそのまま操縦桿の位置になる（画面中央が中立）．
//                ホイールでスロットル．ラダーやフラップなどはキーボードのまま．
// M キーで切り替え．

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// フラップレバーの位置と，空力に効く展開量（0〜1）
export const FLAP_STEPS = [
  { name: 'UP', value: 0 },
  { name: '1', value: 0.25 },
  { name: '2', value: 0.5 },
  { name: '3', value: 0.75 },
  { name: 'FULL', value: 1 },
];
const approach = (x, target, rate, dt) =>
  x < target ? Math.min(target, x + rate * dt) : Math.max(target, x - rate * dt);

export class Controls {
  constructor(stickMode = 'hold', inputMode = 'keyboard', opts = {}) {
    this.stickMode = stickMode;
    this.inputMode = inputMode;
    this.mouseRange = opts.mouseRange ?? 0.3;   // 画面の何割で舵いっぱいになるか
    this.invertMouseY = !!opts.invertMouseY;
    this.mouse = { nx: 0, ny: 0, x: null, y: null };
    this.keys = new Set();
    this.ctl = {
      elevator: 0, aileron: 0, rudder: 0, trim: 0,
      throttle: 0, flapPos: 0, flaps: 0, gear: 1, brake: false,
      parkBrake: false, ap: false, apTarget: { alt: 3000, hdg: null, spd: null },
      lights: { landing: false, nav: true, beacon: true, strobe: false },
    };
    this.onAction = () => {}; // 'camera' | 'reset' | 'pause' | 'help'

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyF': this.setFlaps(this.ctl.flapPos + 1); break;
        case 'KeyE': this.setFlaps(this.ctl.flapPos - 1); break;
        case 'KeyG': this.ctl.gear = this.ctl.gear ? 0 : 1; break;
        case 'BracketRight': this.ctl.trim = clamp(this.ctl.trim + 0.02, -0.5, 0.5); break;
        case 'BracketLeft': this.ctl.trim = clamp(this.ctl.trim - 0.02, -0.5, 0.5); break;
        case 'KeyC': this.ctl.elevator = 0; this.ctl.aileron = 0; this.ctl.rudder = 0; break;
        case 'KeyV': this.onAction('camera'); break;
        case 'KeyR': this.onAction('reset'); break;
        case 'KeyP': this.onAction('pause'); break;
        case 'KeyH': this.onAction('help'); break;
        case 'KeyJ': this.onAction('panel'); break;
        case 'KeyM': this.setInputMode(this.inputMode === 'mouse' ? 'keyboard' : 'mouse'); break;
        case 'KeyK': this.ctl.ap = !this.ctl.ap; this.onAction('ap'); break;
        case 'KeyL': this.ctl.lights.landing = !this.ctl.lights.landing; break;
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      const W = window.innerWidth, H = window.innerHeight;
      const shape = (v) => {
        const a = Math.abs(v);
        if (a < 0.03) return 0;                     // 中央付近の遊び
        const u = Math.min(1, (a - 0.03) / 0.97);
        return Math.sign(v) * (0.4 * u + 0.6 * u * u);   // 中央付近を細かく操作できるカーブ
      };
      this.mouse.nx = shape((e.clientX - W / 2) / (W * this.mouseRange));
      this.mouse.ny = shape((e.clientY - H / 2) / (H * this.mouseRange));
    });
    window.addEventListener('wheel', (e) => {
      if (this.inputMode !== 'mouse') return;
      e.preventDefault();
      this.ctl.throttle = clamp(this.ctl.throttle - Math.sign(e.deltaY) * 0.05, 0, 1);
    }, { passive: false });
    this.setInputMode(inputMode);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // フラップ位置 0〜4（0=UP，4=着陸位置）
  setFlaps(pos) {
    this.ctl.flapPos = clamp(Math.round(pos), 0, FLAP_STEPS.length - 1);
  }

  setInputMode(mode) {
    this.inputMode = mode;
    document.body.classList.toggle('mouse-mode', mode === 'mouse');
    this.onAction('inputMode');
  }

  update(dt) {
    const k = this.keys, c = this.ctl;
    const has = (code) => k.has(code);

    // 操縦桿：↓で機首上げ，↑で機首下げ（実機と同じ）
    const eT = (has('ArrowDown') ? 1 : 0) - (has('ArrowUp') ? 1 : 0);
    const aT = (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0);
    const rT = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
    if (this.inputMode === 'mouse') {
      // カーソルを下に動かすと操縦桿を手前に引く（機首上げ）
      c.aileron = this.mouse.nx;
      c.elevator = this.invertMouseY ? -this.mouse.ny : this.mouse.ny;
      c.rudder = this.stickMode === 'hold'
        ? clamp(c.rudder + rT * 1.0 * dt, -1, 1)
        : approach(c.rudder, rT, rT ? 2 : 3, dt);
    } else if (this.stickMode === 'hold') {
      c.elevator = clamp(c.elevator + eT * 0.6 * dt, -1, 1);
      c.aileron = clamp(c.aileron + aT * 1.0 * dt, -1, 1);
      c.rudder = clamp(c.rudder + rT * 1.0 * dt, -1, 1);
    } else {
      c.elevator = approach(c.elevator, eT, eT ? 1.5 : 3, dt);
      c.aileron = approach(c.aileron, aT, aT ? 2.5 : 4, dt);
      c.rudder = approach(c.rudder, rT, rT ? 2 : 3, dt);
    }

    if (has('KeyW')) c.throttle = clamp(c.throttle + 0.4 * dt, 0, 1);
    if (has('KeyS')) c.throttle = clamp(c.throttle - 0.4 * dt, 0, 1);
    c.brake = has('KeyB') || has('Space') || c.parkBrake;

    // フラップは瞬間では動かず，レバー位置に向かってゆっくり動く
    c.flaps = approach(c.flaps, FLAP_STEPS[c.flapPos].value, 0.12, dt);

    this.readGamepad(dt);
    return c;
  }

  // 一般的なゲームパッド（Xbox配列）を想定．フライトスティックは軸番号が違うことがある．
  readGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return;
    const dz = (x) => (Math.abs(x) < 0.08 ? 0 : x);
    const c = this.ctl;
    const ax = gp.axes;
    if (dz(ax[0])) c.aileron = ax[0];
    if (dz(ax[1])) c.elevator = ax[1];          // 手前に引く（+）で機首上げ
    if (dz(ax[2] ?? 0)) c.rudder = ax[2];       // 右スティック左右
    const up = gp.buttons[7]?.value ?? 0;        // RT
    const down = gp.buttons[6]?.value ?? 0;      // LT
    c.throttle = clamp(c.throttle + (up - down) * 0.5 * dt, 0, 1);
    if (gp.buttons[0]?.pressed) c.brake = true;  // A
  }
}
