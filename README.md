# 矢作研究室（Yahagi Lab）公式サイト

矢作研究室の公式ホームページ一式です。ビルド不要の素の HTML / CSS / JavaScript で構成されており、
`src/` フォルダをそのままサーバーへアップロードするだけで動作します。

## フォルダ構成

```
yhag-lab-website/
├── README.md            ← このファイル
├── vercel.json          ← Vercel デプロイ設定（出力ディレクトリを src/ に指定）
└── src/                 ← 公開用ルート（このフォルダの中身がそのままサイトになる）
    ├── index.html        トップページ
    ├── research.html     研究内容ページ
    ├── members.html       メンバー紹介ページ
    ├── tools/            解析ツール置き場
    │   ├── index.html         ツール一覧ページ
    │   └── flame-analyzer.html  火炎輝度解析ツール（現在は空のプレースホルダー）
    └── assets/
        ├── css/style.css     全ページ共通スタイルシート
        ├── js/script.js      全ページ共通スクリプト（ナビ開閉・ダークモード等）
        └── images/           画像素材置き場（現在は空。ロゴ・写真等を追加する場所）
```

- 各ページは `<header>` / `<nav>` / `<main>` / `<article>` / `<footer>` を用いたセマンティック HTML です。
- ダークモードは OS 設定（`prefers-color-scheme`）に自動追従しつつ、ヘッダー右上のボタンで手動切り替えも可能です（設定は `localStorage` に保存されます）。
- アイコンは [Lucide Icons](https://lucide.dev/)、フォントは [Google Fonts](https://fonts.google.com/)（Inter / Source Serif 4 / Noto Sans JP / Noto Serif JP）を CDN 経由で読み込んでいます。外部ビルドツール・パッケージインストールは一切不要です。

## ローカルでの確認方法

ビルド不要なので、`src/index.html` をブラウザで直接開くだけで確認できます。
ただし相対パスやブラウザのセキュリティ制限を考慮すると、簡易サーバー経由での確認を推奨します。

```bash
# 例1: Python が入っている場合
cd src
python -m http.server 8000
# → http://localhost:8000 をブラウザで開く

# 例2: Node.js が入っている場合
npx serve src
```

## Vercel へのデプロイ

このリポジトリには `vercel.json` を同梱しており、`outputDirectory` を `src` に指定しています。
そのため Vercel プロジェクト設定で Framework Preset を **Other（静的サイト）** のままにし、
Build Command は空欄で構いません。GitHub 連携後、リポジトリを import するだけで `src/` の内容が公開されます。

CLI から直接デプロイする場合:

```bash
npm i -g vercel   # 初回のみ
vercel            # プロジェクトルート（このフォルダ）で実行
```

## ページを追加・編集する

- 新しい固定ページを増やす場合は、`src/` 直下に `xxx.html` を作成し、
  `src/index.html` の `<nav class="main-nav">` と `<footer>` のサイトマップにリンクを追加してください。
- 共通のヘッダー／フッターはテンプレート化されていないため（ビルドツール非依存のため）、
  既存ページの `<header>` 〜 `</header>` と `<footer>` 〜 `</footer>` をコピーして使うと構成がずれません。
- 見た目の調整は `src/assets/css/style.css` の CSS カスタムプロパティ（`:root` 内の色・角丸・余白の変数）を
  変更するだけで、サイト全体に反映されます。

## Fable 5 製ツールの合体手順（Flame Luminance Analyzer 等）

`src/tools/` は、今後 Fable 5 などで作成した解析ツールをこのサイトに合体させるための場所です。
`flame-analyzer.html` は現時点では空のプレースホルダーで、`<div id="tool-embed">` というコメント付きの
目印だけを用意しています。合体作業は次の 2 通りのどちらかで行えます。

### 方法A: マークアップを直接埋め込む（同一ページ内で完結させたい場合）

1. Fable 5 で生成したツールの HTML から、`<body>` の中身（ツール本体の要素）と、
   ツール専用の `<style>` / `<script>` を取り出します。
2. `src/tools/flame-analyzer.html` を開き、`<div id="tool-embed"> ... </div>` の中身を
   取り出した HTML で置き換えます。
3. ツール専用の CSS は `src/tools/flame-analyzer.html` の `<head>` 内、共通 CSS の読み込みより
   **後ろ**に `<link>` または `<style>` として追加してください（共通スタイルを上書きしやすくするため）。
4. ツール専用の JavaScript は `</body>` 直前、共通 `script.js` の読み込みより後ろに追加してください。

### 方法B: 別ファイル化して iframe で埋め込む（ツール側のスクリプト衝突を避けたい場合）

1. Fable 5 で生成したツールの完全な HTML ファイル（`<!DOCTYPE html>` から `</html>` まで）を、
   `src/tools/flame-analyzer-app.html` のような別名で `src/tools/` に配置します。
2. `src/tools/flame-analyzer.html` の `<div id="tool-embed">` の中身を、以下のような `<iframe>` に
   置き換えます。

   ```html
   <div id="tool-embed">
     <iframe
       src="flame-analyzer-app.html"
       title="Flame Luminance Analyzer"
       style="width:100%; min-height:720px; border:1px solid var(--color-border); border-radius:var(--radius-md);"
       loading="lazy"
     ></iframe>
   </div>
   ```

3. この方法ではツール側の CSS / JavaScript が本サイトの共通スタイルと完全に分離されるため、
   Fable 5 側で生成されたコードをそのまま流用しやすくなります。

いずれの方法でも、`src/tools/index.html` のツール一覧カードに付いている
`<span class="status-badge status-soon">近日公開</span>` を
`<span class="status-badge status-live">公開中</span>` に変更すると、公開中であることが一目でわかる
表示になります。

## 今後 TODO（サイト運用者向け）

- [ ] `members.html` の教員・学生氏名、専門分野を実際の情報に差し替える
- [ ] `index.html` / 各ページ footer の住所・メールアドレスを実際の連絡先に差し替える
- [ ] `src/assets/images/` に研究室のロゴ・写真を追加し、各ページのプレースホルダー（アイコン・イニシャル表示）を画像に置き換える
- [ ] Flame Luminance Analyzer 本体を `src/tools/flame-analyzer.html` へ合体（上記手順を参照）
- [ ] 独自ドメインを取得している場合は Vercel のドメイン設定でカスタムドメインを紐付ける
