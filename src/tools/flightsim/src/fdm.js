// 剛体6自由度の飛行力学モデル（FDM）
//  - 位置：測地座標（緯度・経度・楕円体高）
//  - 速度・角速度：機体軸（x前方，y右，z下）
//  - 姿勢：クォータニオン（機体軸 → NED への回転）
//  - 地球は回転しない球として近似（フライトシム用途では十分）

const G0 = 9.80665;
const R_EARTH = 6378137;
const RHO0 = 1.225;
const DEG = Math.PI / 180;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- ベクトル・行列の小道具 ----------
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

// クォータニオン q=[w,x,y,z]（機体→NED）から方向余弦行列 C（行=NED，列=機体）
export function quatToDCM(q) {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}
const mulMV = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];
const mulMtV = (M, v) => [
  M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2],
  M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2],
  M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2],
];

export function eulerToQuat(psi, theta, phi) {
  const cy = Math.cos(psi / 2), sy = Math.sin(psi / 2);
  const cp = Math.cos(theta / 2), sp = Math.sin(theta / 2);
  const cr = Math.cos(phi / 2), sr = Math.sin(phi / 2);
  return [
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ];
}

export function dcmToEuler(C) {
  return {
    heading: Math.atan2(C[1][0], C[0][0]),
    pitch: -Math.asin(clamp(C[2][0], -1, 1)),
    roll: Math.atan2(C[2][1], C[2][2]),
  };
}

// ISA標準大気（対流圏＋成層圏下部）
export function atmosphere(h) {
  if (h < 11000) {
    const T = 288.15 - 0.0065 * h;
    return { rho: RHO0 * Math.pow(T / 288.15, 4.2559), T };
  }
  const T = 216.65;
  return { rho: 0.36392 * Math.exp(-(h - 11000) / 6341.6), T };
}

// ---------- 本体 ----------
export class FlightModel {
  constructor(ac) {
    this.ac = ac;
    this.engineThrust = 0;
    this.crashed = false;
    this.out = {};
    this.reset({ lat: 0, lon: 0, h: 1000, heading: 0, speed: 100 });
  }

  // start: { lat, lon (deg), h (m, 楕円体高), heading (deg), speed (m/s), pitch?(deg), throttle? }
  reset(start) {
    this.lat = start.lat * DEG;
    this.lon = start.lon * DEG;
    this.h = start.h;
    const pitch = (start.pitch ?? 0) * DEG;
    this.q = eulerToQuat(start.heading * DEG, pitch, 0);
    this.vb = [start.speed, 0, 0];
    this.w = [0, 0, 0];
    this.engineThrust = (start.throttle ?? 0) * this.ac.thrustMaxSL;
    this.crashed = false;
    this.crashReason = '';
    // 1ステップ目の前でも状態を参照できるように初期値を入れておく
    const C0 = quatToDCM(this.q);
    const vNed0 = [
      C0[0][0] * this.vb[0], C0[1][0] * this.vb[0], C0[2][0] * this.vb[0],
    ];
    this.out = {
      V: Math.max(start.speed, 0.1), alpha: 0, beta: 0, nz: 1,
      mach: start.speed / 340, vNed: vNed0, onGround: !!start.onGround,
      qbar: 0, p: 0, q: 0, r: 0,
    };
  }

  // 1ステップ積分（半陰的オイラー）
  // ctl: { elevator, aileron, rudder (-1..1), trim, throttle (0..1), flaps (0/1), gear (0/1), brake (bool) }
  // groundH: 機体直下の地面の楕円体高（不明ならnull）
  step(dt, ctl, groundH) {
    if (this.crashed) return;
    const ac = this.ac;
    const C = quatToDCM(this.q);
    const [u, v, w] = this.vb;
    const [p, q, r] = this.w;

    const { rho, T } = atmosphere(this.h);
    const V = Math.max(norm(this.vb), 0.1);
    const Vd = Math.max(V, 5); // 無次元角速度用（低速での発散防止）
    const alpha = Math.atan2(w, u);
    const beta = Math.asin(clamp(v / V, -1, 1));
    const qbar = 0.5 * rho * V * V;

    // 舵角
    const de = -clamp(ctl.elevator + ctl.trim, -1, 1) * ac.deMax;
    const da = clamp(ctl.aileron, -1, 1) * ac.daMax;
    const dr = -clamp(ctl.rudder, -1, 1) * ac.drMax;

    const ph = p * ac.b / (2 * Vd);
    const qh = q * ac.c / (2 * Vd);
    const rh = r * ac.b / (2 * Vd);

    // --- 揚力係数（失速モデル付き） ---
    const CLlin = ac.CL0 + ac.CLa * alpha;
    const CLplate = 2 * Math.sin(alpha) * Math.cos(alpha) * 0.9;
    const s = 1 / (1 + Math.exp(-(Math.abs(alpha) - ac.alphaStall) / (1.5 * DEG)));
    let CL = (1 - s) * CLlin + s * CLplate;
    CL += ac.CLde * de + ac.CLq * qh + ctl.flaps * ac.flapCL;

    const CD = ac.CD0 + ac.k * CL * CL + ctl.flaps * ac.flapCD + ctl.gear * ac.gearCD
      + s * 1.2 * Math.sin(Math.abs(alpha)) ** 2;
    const CY = ac.CYb * beta + ac.CYdr * dr;

    const Cl = ac.Clb * beta + ac.Clp * ph + ac.Clr * rh + ac.Clda * da + ac.Cldr * dr;
    const Cm = ac.Cm0 + ac.Cma * alpha + ac.Cmq * qh + ac.Cmde * de + ctl.flaps * ac.flapCm;
    const Cn = ac.Cnb * beta + ac.Cnp * ph + ac.Cnr * rh + ac.Cnda * da + ac.Cndr * dr;

    const L = qbar * ac.S * CL;
    const D = qbar * ac.S * CD;
    const Y = qbar * ac.S * CY;

    // 風軸 → 機体軸
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const cb = Math.cos(beta), sb = Math.sin(beta);
    let F = [
      -D * ca * cb - Y * ca * sb + L * sa,
      -D * sb + Y * cb,
      -D * sa * cb - Y * sa * sb - L * ca,
    ];
    let M = [
      qbar * ac.S * ac.b * Cl,
      qbar * ac.S * ac.c * Cm,
      qbar * ac.S * ac.b * Cn,
    ];

    // --- エンジン（一次遅れ） ---
    const thrustCmd = clamp(ctl.throttle, 0, 1) * ac.thrustMaxSL * Math.pow(rho / RHO0, ac.thrustDensityExp);
    this.engineThrust += (thrustCmd - this.engineThrust) * (1 - Math.exp(-dt / ac.engineTau));
    F[0] += this.engineThrust;

    // --- 降着装置 ---
    let onGround = false;
    if (groundH != null) {
      for (const g of ac.gear) {
        const rNed = mulMV(C, g.r);
        const pointAlt = this.h - rNed[2];
        const pen = groundH - pointAlt;
        if (pen <= 0) continue;
        if (!ctl.gear) {
          this.crash('脚を下ろさずに接地（胴体着陸）');
          return;
        }
        onGround = true;

        if (pen > ac.crash.maxPen) {
          this.crash('降着装置が耐えきれない速度で接地');
          return;
        }
        const vPointB = add(this.vb, cross(this.w, g.r));
        const vPointN = mulMV(C, vPointB);
        const N = Math.max(0, g.k * pen + g.c * vPointN[2]);

        // 車輪の向き（水平面に投影）
        const st = g.steer ? clamp(ctl.rudder, -1, 1) * ac.steerMax * clamp(1 - V / 40, 0.1, 1) : 0;
        let fwd = mulMV(C, [Math.cos(st), Math.sin(st), 0]);
        fwd = [fwd[0], fwd[1], 0];
        const fl = Math.hypot(fwd[0], fwd[1]) || 1;
        fwd = [fwd[0] / fl, fwd[1] / fl, 0];
        const lat = [-fwd[1], fwd[0], 0];

        const vLon = vPointN[0] * fwd[0] + vPointN[1] * fwd[1];
        const vLat = vPointN[0] * lat[0] + vPointN[1] * lat[1];
        const mu = g.brake && ctl.brake ? ac.muBrake : ac.muRoll;
        const fLon = -mu * N * Math.tanh(vLon / 0.3);
        const fLat = -clamp(ac.latK * N * vLat, -ac.muLat * N, ac.muLat * N);

        const fN = [fwd[0] * fLon + lat[0] * fLat, fwd[1] * fLon + lat[1] * fLat, -N];
        const fB = mulMtV(C, fN);
        F = add(F, fB);
        M = add(M, cross(g.r, fB));
      }
    }

    // 空力＋推力＋接地力による荷重倍数（Gメーター用）
    const nz = -F[2] / (ac.mass * G0);

    // --- 重力 ---
    F = add(F, mulMtV(C, [0, 0, ac.mass * G0]));

    // --- 並進：m(v̇ + ω×v) = F ---
    const cw = cross(this.w, this.vb);
    const vdot = [F[0] / ac.mass - cw[0], F[1] / ac.mass - cw[1], F[2] / ac.mass - cw[2]];
    this.vb = add(this.vb, scale(vdot, dt));

    // --- 回転：Iω̇ = M − ω×(Iω) ---
    const Iw = [ac.Ixx * p, ac.Iyy * q, ac.Izz * r];
    const g2 = cross(this.w, Iw);
    const wdot = [(M[0] - g2[0]) / ac.Ixx, (M[1] - g2[1]) / ac.Iyy, (M[2] - g2[2]) / ac.Izz];
    this.w = add(this.w, scale(wdot, dt));

    // --- 姿勢：q̇ = ½ q ⊗ (0, ω) ---
    const [qw, qx, qy, qz] = this.q;
    const [wx, wy, wz] = this.w;
    const qd = [
      0.5 * (-qx * wx - qy * wy - qz * wz),
      0.5 * (qw * wx + qy * wz - qz * wy),
      0.5 * (qw * wy - qx * wz + qz * wx),
      0.5 * (qw * wz + qx * wy - qy * wx),
    ];
    let nq = [qw + qd[0] * dt, qx + qd[1] * dt, qy + qd[2] * dt, qz + qd[3] * dt];
    const qn = Math.hypot(...nq);
    this.q = nq.map((x) => x / qn);

    // --- 位置 ---
    const vNed = mulMV(quatToDCM(this.q), this.vb);
    const Rh = R_EARTH + this.h;
    this.lat += (vNed[0] / Rh) * dt;
    this.lon += (vNed[1] / (Rh * Math.cos(this.lat))) * dt;
    this.h -= vNed[2] * dt;

    // --- 墜落判定 ---
    if (groundH != null) {
      const e = dcmToEuler(C);
      const cr = ac.crash;
      if (this.h < groundH + cr.bellyClearance) this.crash('機体が地面・建物に接触');
      else if (onGround && Math.abs(e.roll) > cr.rollDeg * DEG) this.crash('翼端やエンジンが地面に接触');
      else if (onGround && e.pitch > cr.pitchUpDeg * DEG) this.crash('尾部が地面に接触（テールストライク）');
      else if (onGround && e.pitch < cr.pitchDownDeg * DEG) this.crash('機首から接地');
    }

    // 表示用
    const M_ = V / Math.sqrt(1.4 * 287.05 * T);
    this.out = { V, alpha, beta, nz, mach: M_, vNed, onGround, qbar, p: this.w[0], q: this.w[1], r: this.w[2] };
  }

  crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
    this.vb = [0, 0, 0];
    this.w = [0, 0, 0];
  }

  // 描画・HUD用の状態
  get state() {
    const C = quatToDCM(this.q);
    return {
      latDeg: this.lat / DEG,
      lonDeg: this.lon / DEG,
      h: this.h,
      C,
      euler: dcmToEuler(C),
      ...this.out,
    };
  }
}
