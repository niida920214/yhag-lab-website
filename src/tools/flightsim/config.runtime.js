// 【config.js との違い】
// このファイルには秘密情報（APIキー）を書きません。Gitで公開されても問題ない
// 設定ファイルです。APIキーだけは以下の優先順位で取得します。
//   1. /api/flightsim-config （Vercel環境変数 GOOGLE_MAPS_API_KEY 経由。本番用）
//   2. ../config.js （.gitignore対象・ローカル開発でしか存在しない前提）
//
// 機体・操縦方法などの設定を変えたい場合は、下の CONFIG のデフォルト値を
// 直接書き換えてください（config.js を作ってそちらに書いてもOK。
// その場合はこのファイルの値より config.js の値が優先されます）。

const CONFIG = {
  GOOGLE_MAPS_API_KEY: '',
  AIRCRAFT: 'airliner',
  STICK_MODE: 'hold',
  INPUT_MODE: 'keyboard',
  MOUSE_RANGE: 0.3,
  MOUSE_INVERT_Y: false,
  COCKPIT_PANEL: true,
  SOUND: true,
  START: 'air',
  TILE_QUALITY: 16,
};

try {
  const res = await fetch('/api/flightsim-config');
  if (res.ok) {
    const data = await res.json();
    if (data.googleMapsApiKey) CONFIG.GOOGLE_MAPS_API_KEY = data.googleMapsApiKey;
  }
} catch (err) {
  // /api が無い環境（例: python -m http.server での簡易ローカル確認）。
  // 下のローカル config.js フォールバックへ。
}

if (!CONFIG.GOOGLE_MAPS_API_KEY) {
  try {
    const local = await import('./config.js');
    Object.assign(CONFIG, local.CONFIG);
  } catch (err) {
    // config.js が無ければ何もしない。main.js 側で「APIキー未設定」の
    // 案内が表示される。
  }
}

export { CONFIG };
