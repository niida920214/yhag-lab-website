// ヘッドアップディスプレイ（キャンバス2Dで描画）
// フォントは Airbus がコックピット表示用に作った B612 を使用．

const DEG = Math.PI / 180;
const HUD_COLOR = '#8dffb0';
const HUD_WARN = '#ffcf5c';
const HUD_DANGER = '#ff6b6b';

export class Hud {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cv.width = this.w * dpr;
    this.cv.height = this.h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // s: FDMの状態, ctl: 操縦入力, opt: { vfov, cockpit, agl, thrustRatio }
  draw(s, ctl, opt) {
    const g = this.g, W = this.w;
    // コックピットパネルが出ているときは，その上端までを描画領域とする
    const panel = document.getElementById('cockpit');
    const panelH = panel && !panel.hidden ? panel.getBoundingClientRect().height : 0;
    const H = this.h - panelH;
    g.clearRect(0, 0, W, this.h);
    if (s.V == null) return;

    g.save();
    g.strokeStyle = HUD_COLOR;
    g.fillStyle = HUD_COLOR;
    g.lineWidth = 1.6;
    g.shadowColor = 'rgba(0,0,0,0.75)';
    g.shadowBlur = 3;
    g.textBaseline = 'middle';

    const cx = W / 2, cy = H / 2;
    const k = (H / 2) / Math.tan(opt.vfov / 2); // px / rad（中心付近）
    const { pitch, roll, heading } = s.euler;

    // ---- ピッチラダー（コックピット視点のときだけ実景と一致） ----
    if (opt.cockpit) {
      g.save();
      g.beginPath();
      g.rect(cx - W * 0.22, cy - H * 0.32, W * 0.44, H * 0.64);
      g.clip();
      g.translate(cx, cy);
      g.rotate(-roll);
      g.font = '12px "B612 Mono", monospace';
      for (let d = -90; d <= 90; d += 5) {
        const y = Math.tan(pitch - d * DEG) * k;
        if (Math.abs(pitch - d * DEG) > 40 * DEG) continue;
        if (d === 0) {
          g.beginPath();
          g.moveTo(-W * 0.2, y); g.lineTo(-40, y);
          g.moveTo(40, y); g.lineTo(W * 0.2, y);
          g.stroke();
          continue;
        }
        const half = d % 10 === 0 ? 70 : 40;
        g.setLineDash(d < 0 ? [7, 5] : []);
        g.beginPath();
        g.moveTo(-half, y); g.lineTo(-24, y); g.lineTo(-24, y + (d > 0 ? 8 : -8));
        g.moveTo(half, y); g.lineTo(24, y); g.lineTo(24, y + (d > 0 ? 8 : -8));
        g.stroke();
        g.setLineDash([]);
        if (d % 10 === 0) {
          g.textAlign = 'right'; g.fillText(Math.abs(d), -half - 6, y);
          g.textAlign = 'left'; g.fillText(Math.abs(d), half + 6, y);
        }
      }
      g.restore();

      // 機軸マーク（W字）
      g.beginPath();
      g.moveTo(cx - 26, cy); g.lineTo(cx - 12, cy); g.lineTo(cx - 6, cy + 8);
      g.lineTo(cx, cy); g.lineTo(cx + 6, cy + 8); g.lineTo(cx + 12, cy); g.lineTo(cx + 26, cy);
      g.stroke();

      // 飛行経路マーカー（速度ベクトルの向き）
      if (s.V > 20) {
        const fx = cx + Math.tan(s.beta) * k;
        const fy = cy + Math.tan(s.alpha) * k;
        g.beginPath();
        g.arc(fx, fy, 7, 0, Math.PI * 2);
        g.moveTo(fx - 18, fy); g.lineTo(fx - 7, fy);
        g.moveTo(fx + 7, fy); g.lineTo(fx + 18, fy);
        g.moveTo(fx, fy - 7); g.lineTo(fx, fy - 15);
        g.stroke();
      }
    }

    // ---- 速度（左）・高度（右）のテープ ----
    const kt = s.V * 1.94384;
    const ft = s.h * 3.28084;
    this.tape(cx - W * 0.3, cy, kt, 10, 'left', Math.round(kt).toString());
    this.tape(cx + W * 0.3, cy, ft, 100, 'right', Math.round(ft).toString());

    // ---- 方位テープ（上） ----
    this.headingTape(cx, 44, ((heading / DEG) + 360) % 360);

    const compact = !!opt.panelVisible;

    // ---- 左下：数値ブロック ----
    if (!compact) {
    g.font = '14px "B612 Mono", monospace';
    g.textAlign = 'left';
    const vs = -s.vNed[2] * 196.85; // ft/min
    const lines = [
      ['M', s.mach.toFixed(2)],
      ['G', s.nz.toFixed(1)],
      ['α', (s.alpha / DEG).toFixed(1) + '°'],
      ['VS', (vs >= 0 ? '+' : '') + Math.round(vs / 10) * 10],
      ['AGL', opt.agl == null ? '----' : Math.round(opt.agl * 3.28084) + ' ft'],
    ];
    let y = H - 150;
    for (const [a, b] of lines) {
      g.fillText(a, cx - W * 0.3 - 40, y);
      g.fillText(b, cx - W * 0.3, y);
      y += 20;
    }

    }

    // ---- 右下：機体の構成 ----
    if (!compact) {
    const thrPct = Math.round(ctl.throttle * 100);
    const rows = [
      ['THR', `${thrPct}%  N ${Math.round(opt.thrustRatio * 100)}%`, null],
      ['FLAP', opt.flapName ?? (ctl.flaps ? 'DOWN' : 'UP'), null],
      ['GEAR', ctl.gear ? 'DOWN' : 'UP', !ctl.gear && opt.agl != null && opt.agl < 150 && s.vNed[2] > 1 ? HUD_DANGER : null],
      ['TRIM', (ctl.trim >= 0 ? '+' : '') + ctl.trim.toFixed(2), null],
      ['BRK', ctl.parkBrake ? 'PARK' : ctl.brake ? 'ON' : '', ctl.brake ? HUD_WARN : null],
    ];
    y = H - 150;
    for (const [a, b, col] of rows) {
      g.fillStyle = HUD_COLOR;
      g.fillText(a, cx + W * 0.3 - 60, y);
      g.fillStyle = col || HUD_COLOR;
      g.fillText(b, cx + W * 0.3, y);
      y += 20;
    }

    }

    // ---- 操縦桿の位置（下中央）．hold モードでは舵が保持されるので位置の確認用に ----
    {
      const bx = cx, by = H - 92, half = 34;
      g.save();
      g.lineWidth = 1.2;
      g.strokeRect(bx - half, by - half, half * 2, half * 2);
      g.beginPath();
      g.moveTo(bx - 5, by); g.lineTo(bx + 5, by);
      g.moveTo(bx, by - 5); g.lineTo(bx, by + 5);
      g.stroke();
      // 機首上げ（引く）を下方向に表示
      const sx = bx + ctl.aileron * half, sy = by + ctl.elevator * half;
      g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); g.fill();
      // トリム位置
      const ty = by + ctl.trim * half;
      g.beginPath(); g.moveTo(bx + half + 3, ty); g.lineTo(bx + half + 11, ty - 5); g.lineTo(bx + half + 11, ty + 5); g.closePath(); g.stroke();
      // ラダー
      const ry = by + half + 12;
      g.beginPath(); g.moveTo(bx - half, ry); g.lineTo(bx + half, ry); g.stroke();
      g.fillRect(bx + ctl.rudder * half - 2, ry - 5, 4, 10);
      g.font = '11px "B612", sans-serif';
      g.textAlign = 'center';
      const label = opt.inputMode === 'mouse' ? 'MOUSE（M で切替）'
        : opt.stickMode === 'hold' ? 'STICK HOLD（C で中立）' : 'STICK';
      g.fillText(label, bx, by - half - 10);
      g.restore();
    }

    // ---- マウスモード：操縦範囲とカーソル ----
    if (opt.inputMode === 'mouse') {
      g.save();
      g.lineWidth = 1;
      g.globalAlpha = 0.35;
      const rx = W * opt.mouseRange, ry = H * opt.mouseRange;
      g.strokeRect(cx - rx, cy - ry, rx * 2, ry * 2);
      g.globalAlpha = 0.8;
      if (opt.mouse && opt.mouse.x != null) {
        const mx = opt.mouse.x, my = opt.mouse.y;
        g.setLineDash([4, 6]);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(mx, my); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(mx, my, 10, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(mx, my, 2, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    // ---- 警告 ----
    g.font = '18px "B612", sans-serif';
    g.textAlign = 'center';
    const warn = [];
    if (Math.abs(s.alpha) > 12 * DEG && !s.onGround) warn.push(['STALL', HUD_DANGER]);
    if (s.nz > 7) warn.push(['OVER-G', HUD_WARN]);
    if (opt.agl != null && opt.agl < 300 && s.vNed[2] > 15 && !s.onGround) warn.push(['PULL UP', HUD_DANGER]);
    warn.forEach(([t, c], i) => {
      g.fillStyle = c;
      g.fillText(t, cx, cy + H * 0.2 + i * 26);
    });

    g.restore();
  }

  tape(x, cy, value, step, side, label) {
    const g = this.g;
    const span = 150, pxPer = span / (step * 5);
    g.font = '12px "B612 Mono", monospace';
    g.textAlign = side === 'left' ? 'right' : 'left';
    const dir = side === 'left' ? -1 : 1;
    g.save();
    g.beginPath();
    g.rect(x - 70, cy - span, 140, span * 2);
    g.clip();
    const base = Math.floor(value / step) * step;
    for (let v = base - step * 6; v <= base + step * 6; v += step) {
      const y = cy - (v - value) * pxPer;
      const major = v % (step * 5) === 0;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dir * (major ? 12 : 6), y);
      g.stroke();
      if (major) g.fillText(v, x + dir * 16, y);
    }
    g.beginPath(); g.moveTo(x, cy - span); g.lineTo(x, cy + span); g.stroke();
    g.restore();

    // 現在値の窓
    g.font = '16px "B612 Mono", monospace';
    const bw = 72, bh = 26;
    const bx = side === 'left' ? x - 16 - bw : x + 16;
    g.save();
    g.fillStyle = 'rgba(0,20,8,0.55)';
    g.fillRect(bx, cy - bh / 2, bw, bh);
    g.restore();
    g.strokeRect(bx, cy - bh / 2, bw, bh);
    g.textAlign = 'center';
    g.fillText(label, bx + bw / 2, cy + 1);
  }

  headingTape(cx, y, hdg) {
    const g = this.g;
    const half = 180, pxPerDeg = 6;
    g.save();
    g.beginPath();
    g.rect(cx - half, y - 24, half * 2, 48);
    g.clip();
    g.font = '12px "B612 Mono", monospace';
    g.textAlign = 'center';
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    const base = Math.floor(hdg / 5) * 5;
    for (let d = base - 35; d <= base + 35; d += 5) {
      const x = cx + (d - hdg) * pxPerDeg;
      const dd = ((d % 360) + 360) % 360;
      const major = dd % 10 === 0;
      g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x, y + (major ? 0 : 5)); g.stroke();
      if (major) g.fillText(names[dd] ?? String(dd / 10).padStart(2, '0'), x, y - 8);
    }
    g.restore();
    g.beginPath();
    g.moveTo(cx, y + 12); g.lineTo(cx - 6, y + 20); g.lineTo(cx + 6, y + 20); g.closePath();
    g.stroke();
    g.font = '14px "B612 Mono", monospace';
    g.textAlign = 'center';
    g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), cx, y + 34);
  }
}
