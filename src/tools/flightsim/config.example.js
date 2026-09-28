// このファイルを config.js という名前でコピーして，APIキーを書き込んでください．
// config.js は他人に共有しないこと（キーが漏れると課金されます）．

export const CONFIG = {
  // Google Cloud で「Map Tiles API」を有効にしたAPIキー
  GOOGLE_MAPS_API_KEY: '',

  // 機体：'airliner'（超大型4発機・A380級の重量と寸法）または 'jet'（小型ジェット）
  AIRCRAFT: 'airliner',

  // 操縦桿：'hold'（離しても舵がそのまま．Cキーで中立）または 'spring'（離すと中立に戻る）
  STICK_MODE: 'hold',

  // 操縦方法：'keyboard'（矢印キー）または 'mouse'（カーソルの位置で操縦）．飛行中は M キーで切り替え
  INPUT_MODE: 'keyboard',
  MOUSE_RANGE: 0.3,         // 画面中央からこの割合だけカーソルを動かすと舵いっぱい
  MOUSE_INVERT_Y: false,    // true にすると上下が逆（カーソルを上で機首上げ）

  // コックピットの計器パネルを最初から表示する（飛行中は J キーで切替）
  COCKPIT_PANEL: true,

  // 墜落時の爆発音
  SOUND: true,

  // 開始地点：'air'（羽田沖の上空）または 'runway'（羽田C滑走路の端）
  START: 'air',

  // 開始地点を好きな場所にしたいときはここで上書き（例：富士山の近く）
  // START_OVERRIDE: { lat: 35.36, lon: 138.73, h: 4500, heading: 0 },

  // 自分で入手した機体の3Dモデル（.glb / .gltf）を使う場合．
  // models フォルダに置いてパスを書く．向きや大きさがずれていたら数値で補正する．
  // offset は機体軸（x前方，y右，z下向き）での移動量 m．
  // MODEL: { url: './models/aircraft.glb', scale: 1, yawDeg: 0, pitchDeg: 0, rollDeg: 0, offset: [0, 0, 0] },

  // 地形の精細さ．数字が大きいほど粗く軽くなる（標準16，重いときは24〜32）
  TILE_QUALITY: 16,
};
