/**
 * Flight Sim 用の設定配信 API — Vercel Serverless Function
 *
 * GET /api/flightsim-config … Google Maps API キーを { googleMapsApiKey } で返す
 *
 * 目的: src/tools/flightsim/config.js はAPIキーが直書きされるため .gitignore
 * 対象で、Gitには含まれない（GitHubに公開しても課金リスクのあるキーが漏れない
 * ようにするため）。デプロイ後にキーを使えるよう、Vercelの環境変数から
 * 読み出してブラウザに渡す小さな仲介役がこのAPI。
 *
 * 必要な環境変数（Vercel ダッシュボード → Settings → Environment Variables）:
 *   - GOOGLE_MAPS_API_KEY … Map Tiles API を有効にしたGoogle CloudのAPIキー
 *     （このキーのHTTPリファラー制限に、デプロイ先のドメイン
 *       例: https://yhag-lab-website.vercel.app/* を追加しておくこと）
 */
export default function handler(req, res) {
  res.status(200).json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" });
}
