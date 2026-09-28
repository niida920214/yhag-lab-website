// 簡易オートパイロット
// 高度・方位・速度の目標値に向けて，操縦桿とスロットルを動かす．
// 制御はカスケードPID：目標高度 → 目標昇降率 → 目標ピッチ → 昇降舵，
//                    目標方位 → 目標バンク角 → 補助翼．
// 実機の自動操縦とは別物の，あくまで飛行を楽にするための簡単なものです．

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class Autopilot {
  constructor() { this.iSpd = 0; this.iAlt = 0; this.iRoll = 0; this.alphaF = null; this.active = false; }

  // 入り切りの瞬間に積分項を消す
  setActive(on) {
    if (on !== this.active) { this.iSpd = 0; this.iAlt = 0; this.iRoll = 0; this.alphaF = null; }
    this.active = on;
  }

  // st: FDMの状態，ctl: 操縦入力（直接書き換える），dt: 秒
  update(st, ctl, dt) {
    const t = ctl.apTarget;
    const ftm = 0.3048;
    const V = Math.max(st.V, 40);

    // --- 方位 → バンク角 → 補助翼 ---
    let bankTarget = 0;
    if (t.hdg != null) {
      const eH = (((t.hdg * DEG - st.euler.heading) / DEG) + 540) % 360 - 180;
      bankTarget = clamp(eH * 2.2, -27, 27) * DEG;
    }
    const eRoll = bankTarget - st.euler.roll;
    this.iRoll = clamp(this.iRoll + eRoll * dt * 0.4, -0.15, 0.15);
    ctl.aileron = clamp(eRoll * 3.2 + this.iRoll - st.p * 1.2, -1, 1);
    ctl.rudder = clamp(-st.beta * 4, -0.4, 0.4);          // 横滑りを消す

    // --- 高度 → 昇降率 → 経路角 → ピッチ → 昇降舵 ---
    const targetAlt = (t.alt ?? st.h / ftm) * ftm;
    const errAlt = targetAlt - st.h;
    const vsMax = 12;                                      // m/s
    const vsTarget = clamp(errAlt * 0.06, -vsMax, vsMax);
    const vs = -st.vNed[2];
    this.iAlt = clamp(this.iAlt + (vsTarget - vs) * dt * 0.015, -0.12, 0.12);

    // 目標の経路角に迎角を足したものが目標ピッチ．旋回中は揚力が減るぶん上乗せする．
    // 迎角は短周期で揺れるので，ゆっくり追従させた値を使う（振動を防ぐ）
    this.alphaF = this.alphaF == null ? st.alpha : this.alphaF + (st.alpha - this.alphaF) * Math.min(1, dt / 4);
    const gammaT = Math.asin(clamp(vsTarget / V, -0.3, 0.3));
    const bankComp = (1 / Math.max(Math.cos(st.euler.roll), 0.5) - 1) * 3 * DEG;
    const pitchTarget = clamp(gammaT + this.alphaF + this.iAlt + bankComp, -10 * DEG, 14 * DEG);
    ctl.elevator = clamp((pitchTarget - st.euler.pitch) * 3.2 - st.q * 3.5, -1, 1);

    // --- 速度 → スロットル ---
    if (t.spd != null) {
      const vTarget = t.spd / 1.94384;
      const eV = vTarget - st.V;
      this.iSpd = clamp(this.iSpd + eV * dt * 0.012, -0.55, 0.55);
      // 上昇中は推力を多めに
      const ff = 0.35 + clamp(vsTarget / vsMax, -1, 1) * 0.3;
      ctl.throttle = clamp(ff + eV * 0.025 + this.iSpd, 0, 1);
    }
  }
}
