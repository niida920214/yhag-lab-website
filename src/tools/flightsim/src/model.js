// オリジナル外観の機体モデルをプログラムで生成し，glTF バイナリ（GLB）として出力する．
// 座標系は Cesium のモデル座標（x 前方，y 左，z 上）で直接作る．
// 寸法は aircraft.js の visual で指定する．

const DEG = Math.PI / 180;

// ---------- マテリアル ----------
const MATERIALS = {
  body:   { color: [0.93, 0.94, 0.95], metallic: 0.05, roughness: 0.40 },
  belly:  { color: [0.78, 0.80, 0.83], metallic: 0.10, roughness: 0.45 },
  wing:   { color: [0.70, 0.73, 0.76], metallic: 0.35, roughness: 0.45 },
  tail:   { color: [0.07, 0.20, 0.38], metallic: 0.10, roughness: 0.40 },
  stripe: { color: [0.16, 0.55, 0.62], metallic: 0.10, roughness: 0.40 },
  nacelle:{ color: [0.86, 0.87, 0.89], metallic: 0.30, roughness: 0.35 },
  metal:  { color: [0.55, 0.57, 0.60], metallic: 0.80, roughness: 0.30 },
  dark:   { color: [0.03, 0.04, 0.05], metallic: 0.00, roughness: 0.60 },
  glass:  { color: [0.04, 0.07, 0.10], metallic: 0.20, roughness: 0.10 },
  tire:   { color: [0.05, 0.05, 0.05], metallic: 0.00, roughness: 0.90 },
  gear:   { color: [0.62, 0.64, 0.66], metallic: 0.60, roughness: 0.40 },
};

// ---------- 小道具 ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// 1つの部品（頂点・三角形）．法線は部品ごとに計算して滑らかにする．
class Part {
  constructor() { this.p = []; this.i = []; }
  v(pt) { this.p.push(pt); return this.p.length - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  normals() {
    const n = this.p.map(() => [0, 0, 0]);
    for (let k = 0; k < this.i.length; k += 3) {
      const [a, b, c] = [this.i[k], this.i[k + 1], this.i[k + 2]];
      const f = crs(sub(this.p[b], this.p[a]), sub(this.p[c], this.p[a]));
      for (const j of [a, b, c]) n[j] = addv(n[j], f);
    }
    return n.map(nrm);
  }
}

// グリッド状の面（rows × cols，cols 方向を閉じるかどうか）
function gridPart(rows, cols, fn, closeCols) {
  const part = new Part();
  const idx = [];
  for (let r = 0; r < rows; r++) {
    idx.push([]);
    for (let c = 0; c < cols; c++) idx[r].push(part.v(fn(r, c)));
  }
  const cMax = closeCols ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cMax; c++) {
      const c2 = (c + 1) % cols;
      part.quad(idx[r][c], idx[r + 1][c], idx[r + 1][c2], idx[r][c2]);
    }
  }
  return { part, idx };
}

// 輪郭を閉じるふた（中心から扇形）
function capPart(points, center) {
  const part = new Part();
  const c = part.v(center);
  const ids = points.map((p) => part.v(p));
  for (let k = 0; k < ids.length; k++) part.tri(c, ids[k], ids[(k + 1) % ids.length]);
  return part;
}

// ---------- 胴体 ----------
function makeFuselageShape(V) {
  const R = V.radius, L = V.length, xN = V.noseX, xT = xN - L;
  const tn = 0.13, tt = 0.70;
  // t: 0（機首）〜 1（尾端），θ: 0 が左側面，π/2 が上
  return (t, th) => {
    const x = xN - t * L;
    let r, zc = 0;
    if (t < tn) {
      const u = t / tn;
      r = R * Math.pow(1 - Math.pow(1 - u, 2.2), 0.5);
      zc = -0.18 * R * Math.pow(1 - u, 2);
    } else if (t > tt) {
      const u = (t - tt) / (1 - tt);
      r = R * (1 - 0.86 * Math.pow(u, 1.25));
      zc = (R - r) * 0.82;                    // 下面が跳ね上がる尾部
    } else r = R;
    r = Math.max(r, 0.004 * R);
    return [x, Math.cos(th) * r, zc + Math.sin(th) * r * V.heightRatio];
  };
}

function fuselage(V, add) {
  const S = makeFuselageShape(V);
  const rows = 90, cols = 40;
  const ts = (r) => Math.pow(r / (rows - 1), 1.0);
  const { part, idx } = gridPart(rows, cols, (r, c) => S(ts(r), (c / cols) * 2 * Math.PI), true);
  add('body', part);
  // 尾端のふた
  const last = idx[rows - 1].map((i) => part.p[i]);
  const ctr = last.reduce((a, b) => addv(a, b), [0, 0, 0]).map((x) => x / last.length);
  add('body', capPart(last.slice().reverse(), ctr));

  // 胴体表面から少しだけ外側の点（塗り分けや窓を貼るため）
  const out = (t, th, k) => {
    const p = S(t, th);
    const c = mul(addv(S(t, 0), S(t, Math.PI)), 0.5);
    return addv(c, mul(sub(p, c), k));
  };

  // 下面の色分け
  add('belly', gridPart(60, 12, (r, c) =>
    out(0.14 + 0.54 * (r / 59), -Math.PI / 2 + (c / 11 - 0.5) * 1.6, 1.004), false).part);

  // 胴体側面のライン
  for (const side of [1, -1]) {
    add('stripe', gridPart(70, 2, (r, c) => {
      const th = side > 0 ? -0.16 - c * 0.07 : Math.PI + 0.16 + c * 0.07;
      return out(0.10 + 0.74 * (r / 69), th, 1.005);
    }, false).part);
  }

  // 客室窓
  const W = V.windows;
  for (const side of [1, -1]) {
    for (let x = W.x0; x >= W.x1; x -= W.pitch) {
      const t = (V.noseX - x) / V.length;
      const dt = W.w / V.length / 2;
      const dth = W.h / V.radius / 2;
      const th0 = side > 0 ? 0.22 : Math.PI - 0.22;
      const part = new Part();
      const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => part.v(out(t + a * dt, th0 + b * dth, 1.008)));
      part.quad(ids[0], ids[1], ids[2], ids[3]);
      add('glass', part);
    }
  }

  // 操縦室の窓（機首上面の帯）
  add('glass', gridPart(4, 12, (r, c) =>
    out(0.068 + 0.026 * (r / 3), 0.62 + (Math.PI - 1.24) * (c / 11), 1.012), false).part);
}

// ---------- 翼面（主翼・尾翼・パイロン共通） ----------
// rootLE: 付け根前縁，spanDir: 翼幅方向の単位ベクトル，thickDir: 厚み方向，
// 前縁は翼幅方向に進むにつれて後退角 sweep で後ろ（-x）にずれる．
function liftingSurface(opt) {
  const { rootLE, spanDir, thickDir, span, rootChord, tipChord, sweep, thick, material, add } = opt;
  const nc = 18, ns = 8;
  const xc = []; // コサイン分布
  for (let k = 0; k < nc; k++) xc.push(0.5 * (1 - Math.cos((Math.PI * k) / (nc - 1))));
  const tFun = (x) => 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  // 断面を一周する点列（上面：前縁→後縁，下面：後縁→前縁）
  const loop = [];
  for (let k = 0; k < nc; k++) loop.push([xc[k], tFun(xc[k])]);
  for (let k = nc - 2; k > 0; k--) loop.push([xc[k], -tFun(xc[k])]);

  const pointAt = (eta, u, w) => {
    const chord = rootChord + (tipChord - rootChord) * eta;
    const le = addv(rootLE, mul(spanDir, span * eta));
    le[0] -= span * eta * Math.tan(sweep * DEG);
    return addv(addv(le, [-u * chord, 0, 0]), mul(thickDir, w * chord));
  };
  const { part, idx } = gridPart(ns, loop.length, (r, c) => pointAt(r / (ns - 1), loop[c][0], loop[c][1]), true);
  add(material, part);
  // 翼端・付け根のふた
  for (const r of [0, ns - 1]) {
    const pts = idx[r].map((i) => part.p[i]);
    const ctr = pts.reduce((a, b) => addv(a, b), [0, 0, 0]).map((x) => x / pts.length);
    add(material, capPart(r === 0 ? pts.slice().reverse() : pts, ctr));
  }
  return pointAt;
}

// ---------- 回転体（エンジンナセル，車輪など） ----------
function lathe(profile, axisOrigin, axisDir, up, segs, material, add, capFront, capBack) {
  const side = nrm(crs(axisDir, up));
  const up2 = crs(side, axisDir);
  const { part, idx } = gridPart(profile.length, segs, (r, c) => {
    const th = (c / segs) * 2 * Math.PI;
    const [s, rad] = profile[r];
    return addv(addv(axisOrigin, mul(axisDir, s)), addv(mul(side, Math.cos(th) * rad), mul(up2, Math.sin(th) * rad)));
  }, true);
  add(material, part);
  const capAt = (r, mat, reverse) => {
    const pts = idx[r].map((i) => part.p[i]);
    add(mat, capPart(reverse ? pts.slice().reverse() : pts, addv(axisOrigin, mul(axisDir, profile[r][0]))));
  };
  if (capFront) capAt(0, capFront, true);
  if (capBack) capAt(profile.length - 1, capBack, false);
}

function engine(V, e, add) {
  const R = V.engineRadius, L = V.engineLength;
  const origin = [e.x + L * 0.35, e.y, e.z];
  const prof = [
    [0, R * 0.86], [L * 0.03, R * 0.97], [L * 0.10, R], [L * 0.45, R * 0.98],
    [L * 0.75, R * 0.86], [L * 0.92, R * 0.70], [L, R * 0.62],
  ];
  lathe(prof, origin, [-1, 0, 0], [0, 0, 1], 32, 'nacelle', add, 'dark', null);
  // 排気コーン
  lathe([[L * 0.95, R * 0.5], [L * 1.12, R * 0.28], [L * 1.2, R * 0.03]], origin, [-1, 0, 0], [0, 0, 1], 20, 'metal', add, null, null);
  // 吸気口の縁（金属色）
  lathe([[-0.001, R * 0.86], [L * 0.02, R * 0.95]], origin, [-1, 0, 0], [0, 0, 1], 32, 'metal', add, null, null);
}

function pylon(V, e, wingZAt, add) {
  const R = V.engineRadius, L = V.engineLength;
  const top = e.z + R * 0.9;
  const h = Math.max(0.3, wingZAt - top + V.wing.thick * V.wing.rootChord * 0.3);
  liftingSurface({
    rootLE: [e.x + L * 0.1, e.y, top], spanDir: [0, 0, 1], thickDir: [0, 1, 0],
    span: h, rootChord: L * 0.75, tipChord: L * 0.8, sweep: -10, thick: 0.08,
    material: 'wing', add,
  });
}

// ---------- 降着装置 ----------
function landingGear(ac, V, add) {
  const wr = V.wheelRadius;
  for (const g of ac.gear) {
    const x = g.r[0], y = -g.r[1], zg = -g.r[2];   // 機体軸 → モデル座標
    const wheelZ = zg + wr;
    const nose = g.steer;
    const topZ = nose ? -V.radius * 0.75 : V.wing.z - 0.2;
    // 支柱
    lathe([[0, wr * 0.22], [topZ - wheelZ, wr * 0.22]], [x, y, wheelZ], [0, 0, 1], [1, 0, 0], 12, 'gear', add, null, null);
    // 車輪
    const pairs = nose ? [[0, 1]] : [[wr * 1.2, 1], [-wr * 1.2, 1]];
    for (const [dx] of pairs) {
      for (const sy of [-1, 1]) {
        const cx = x + dx, cy = y + sy * wr * 0.75;
        lathe([[-wr * 0.3, wr * 0.75], [-wr * 0.3, wr], [wr * 0.3, wr], [wr * 0.3, wr * 0.75]],
          [cx, cy, wheelZ], [0, 1, 0], [0, 0, 1], 20, 'tire', add, 'gear', 'gear');
      }
    }
    if (!nose) {
      // ボギー（車軸をつなぐ梁）
      lathe([[-wr * 1.4, wr * 0.15], [wr * 1.4, wr * 0.15]], [x, y, wheelZ], [1, 0, 0], [0, 0, 1], 10, 'gear', add, 'gear', 'gear');
    }
  }
}

// ---------- 全体の組み立て ----------
export function buildAircraftGLB(ac) {
  const V = ac.visual;
  const groups = { body: {}, gear: {} }; // ノード名 → マテリアル名 → Part[]
  const adder = (node) => (mat, part) => { (groups[node][mat] ??= []).push(part); };
  const add = adder('body');

  fuselage(V, add);

  // 主翼（左右）
  const w = V.wing;
  const R = V.radius;
  let wingPoint = {};
  for (const sgn of [1, -1]) {
    const G = w.dihedral * DEG;
    wingPoint[sgn] = liftingSurface({
      rootLE: [w.rootX, sgn * R * 0.6, w.z], spanDir: [0, sgn * Math.cos(G), Math.sin(G)],
      thickDir: [0, -sgn * Math.sin(G), Math.cos(G)], span: w.span - R * 0.6,
      rootChord: w.rootChord, tipChord: w.tipChord, sweep: w.sweep, thick: w.thick, material: 'wing', add,
    });
    // ウィングレット
    const tip = wingPoint[sgn](1, 0, 0);
    liftingSurface({
      rootLE: tip, spanDir: nrm([0, sgn * 0.25, 1]), thickDir: [0, 1, 0],
      span: w.tipChord * 0.9, rootChord: w.tipChord, tipChord: w.tipChord * 0.35, sweep: 40, thick: 0.08,
      material: 'tail', add,
    });
    // 水平尾翼
    const h = V.htail, H = h.dihedral * DEG;
    liftingSurface({
      rootLE: [h.rootX, sgn * R * 0.25, h.z], spanDir: [0, sgn * Math.cos(H), Math.sin(H)],
      thickDir: [0, -sgn * Math.sin(H), Math.cos(H)], span: h.span,
      rootChord: h.rootChord, tipChord: h.tipChord, sweep: h.sweep, thick: h.thick, material: 'wing', add,
    });
  }
  // 垂直尾翼
  const vt = V.vtail;
  liftingSurface({
    rootLE: [vt.rootX, 0, R * 0.55], spanDir: [0, 0, 1], thickDir: [0, 1, 0],
    span: vt.span, rootChord: vt.rootChord, tipChord: vt.tipChord, sweep: vt.sweep, thick: vt.thick,
    material: 'tail', add,
  });

  // 翼胴フェアリング（主翼付け根の膨らみ）
  lathe([[0, 0.02], [w.rootChord * 0.1, R * 0.35], [w.rootChord * 0.6, R * 0.42], [w.rootChord * 1.15, R * 0.3], [w.rootChord * 1.35, 0.02]],
    [w.rootX + w.rootChord * 0.15, 0, w.z - R * 0.25], [-1, 0, 0], [0, 0, 1], 28, 'belly', add, null, null);

  // エンジンとパイロン（左右対称）
  for (const e0 of V.engines) {
    for (const sgn of [1, -1]) {
      const e = { x: e0.x, y: sgn * e0.y, z: e0.z };
      engine(V, e, add);
      // エンジン位置での主翼下面の高さ
      const eta = (e0.y - R * 0.6) / (w.span - R * 0.6);
      const wz = wingPoint[sgn](eta, 0.3, 0)[2] - w.thick * 0.3;
      pylon(V, e, wz, add);
    }
  }

  landingGear(ac, V, adder('gear'));

  return writeGLB(groups);
}

// ---------- GLB 書き出し ----------
function writeGLB(groups) {
  const matNames = Object.keys(MATERIALS);
  const gltf = {
    asset: { version: '2.0', generator: 'flightsim procedural model' },
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [],
    materials: matNames.map((n) => ({
      name: n,
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [...MATERIALS[n].color, 1],
        metallicFactor: MATERIALS[n].metallic,
        roughnessFactor: MATERIALS[n].roughness,
      },
    })),
    accessors: [], bufferViews: [], buffers: [],
  };
  const chunks = [];
  let offset = 0;
  const pushView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    chunks.push(bytes);
    if (pad) chunks.push(new Uint8Array(pad));
    offset += bytes.length + pad;
    return gltf.bufferViews.length - 1;
  };

  for (const [nodeName, mats] of Object.entries(groups)) {
    const primitives = [];
    for (const [mat, parts] of Object.entries(mats)) {
      const P = [], N = [], I = [];
      for (const part of parts) {
        const base = P.length / 3;
        const nr = part.normals();
        part.p.forEach((p, k) => { P.push(...p); N.push(...nr[k]); });
        for (const i of part.i) I.push(i + base);
      }
      const pos = new Float32Array(P), nor = new Float32Array(N), ind = new Uint32Array(I);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < pos.length; k += 3) for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], pos[k + a]); max[a] = Math.max(max[a], pos[k + a]);
      }
      const vp = pushView(pos, 34962), vn = pushView(nor, 34962), vi = pushView(ind, 34963);
      gltf.accessors.push({ bufferView: vp, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
      gltf.accessors.push({ bufferView: vn, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
      gltf.accessors.push({ bufferView: vi, componentType: 5125, count: ind.length, type: 'SCALAR' });
      const a = gltf.accessors.length;
      primitives.push({ attributes: { POSITION: a - 3, NORMAL: a - 2 }, indices: a - 1, material: matNames.indexOf(mat) });
    }
    gltf.meshes.push({ name: nodeName, primitives });
    gltf.nodes.push({ name: nodeName, mesh: gltf.meshes.length - 1 });
    gltf.scenes[0].nodes.push(gltf.nodes.length - 1);
  }
  gltf.buffers.push({ byteLength: offset });

  const bin = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) { bin.set(c, o); o += c.length; }

  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jpad = (4 - (json.length % 4)) % 4;
  if (jpad) { const j2 = new Uint8Array(json.length + jpad).fill(0x20); j2.set(json); json = j2; }

  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, json.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(json, 20);
  const b0 = 20 + json.length;
  dv.setUint32(b0, bin.length, true); dv.setUint32(b0 + 4, 0x004e4942, true); out.set(bin, b0 + 8);
  return out;
}
