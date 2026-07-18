/**
 * 共有写真 API — Vercel Serverless Function
 *
 * GET  /api/photo?slot=<name>  … そのスロットの現在の写真URLを返す { url: string|null }
 * POST /api/photo?slot=<name>  … 写真をアップロードして全訪問者に共有する
 *   body: { passphrase: string, dataUrl: "data:image/jpeg;base64,..." }
 *   - passphrase は Vercel の環境変数 UPLOAD_PASSPHRASE と照合（いたずら防止）
 *   - 画像は Vercel Blob に photos/<slot>.jpg として上書き保存される
 *
 * 必要な環境変数（Vercel ダッシュボード → Settings → Environment Variables）:
 *   - BLOB_READ_WRITE_TOKEN … Blob Store をプロジェクトに接続すると自動追加
 *   - UPLOAD_PASSPHRASE     … アップロード用の合言葉（手動で追加する）
 */
import { put, list } from "@vercel/blob";

const SLOTS = new Set(["logo", "hero-left", "hero-right"]);
const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5MB（フロントで512pxに縮小済みなので通常は~100KB）
const DATA_URL_PREFIX = "data:image/jpeg;base64,";

export default async function handler(req, res) {
  const slot = String(req.query.slot || "");
  if (!SLOTS.has(slot)) {
    return res.status(400).json({ error: "invalid slot" });
  }
  const pathname = `photos/${slot}.jpg`;

  if (req.method === "GET") {
    try {
      const { blobs } = await list({ prefix: pathname, limit: 1 });
      const blob = blobs.find((b) => b.pathname === pathname);
      return res.status(200).json({ url: blob ? blob.url : null });
    } catch (err) {
      return res.status(500).json({ error: "storage unavailable" });
    }
  }

  if (req.method === "POST") {
    const expected = process.env.UPLOAD_PASSPHRASE;
    if (!expected) {
      return res.status(503).json({ error: "UPLOAD_PASSPHRASE not configured" });
    }

    const { passphrase, dataUrl } = req.body || {};
    if (passphrase !== expected) {
      return res.status(401).json({ error: "wrong passphrase" });
    }
    if (typeof dataUrl !== "string" || !dataUrl.startsWith(DATA_URL_PREFIX)) {
      return res.status(400).json({ error: "invalid image (expected jpeg data URL)" });
    }

    const buffer = Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64");
    if (!buffer.length || buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: "image too large" });
    }

    try {
      const blob = await put(pathname, buffer, {
        access: "public",
        addRandomSuffix: false, // URLを固定（photos/<slot>.jpg）にして上書き運用
        allowOverwrite: true,
        contentType: "image/jpeg",
        cacheControlMaxAge: 60, // 上書き後、最長でも約1分で全員に反映
      });
      return res.status(200).json({ url: blob.url });
    } catch (err) {
      return res.status(500).json({ error: "upload failed" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
}
