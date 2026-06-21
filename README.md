# MLM Org Chart

バイナリツリー構造のMLM組織図管理アプリ。Googleログインで複数端末から同じデータにアクセスできます。

## 機能

- **バイナリツリー表示** — 左右2分木の組織図をビジュアルで管理
- **ログイン** — Googleログイン／メールアドレス登録（Gmailを持たない人向け）の2方式
- **リアルタイム同期** — Firestoreでスマホ・PCのデータを自動同期
- **ドラッグ&ドロップ** — サブツリーごと移動可能
- **元に戻す** — 最大20回分の操作を記録（メモリ上）
- **写真対応** — メンバー写真を160×160pxにリサイズして保存
- **役職カラー** — PDCM / DCM / ECM / PM / GM の5段階

---

## セットアップ手順

### 1. リポジトリをクローン

```bash
git clone https://github.com/<your-username>/mlm-org-chart.git
cd mlm-org-chart
npm install
```

### 2. Firebase プロジェクトを作成

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト新規作成
2. **Authentication** → ログイン方法 → **Google** と **メール/パスワード** を有効化
3. **Firestore Database** → データベース作成（本番モードで開始）
4. **プロジェクト設定** → マイアプリ → ウェブアプリ追加 → SDK設定をコピー

### 3. 環境変数を設定

```bash
cp .env.example .env.local
```

`.env.local` を開いて Firebase の値を入力：

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc...
```

### 4. Firestore セキュリティルールを適用

Firebase Console → Firestore → ルール タブを開き、`firestore.rules` の内容を貼り付けて公開。

または Firebase CLI を使う場合：

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # プロジェクト選択、既存ファイルを使用
firebase deploy --only firestore:rules
```

### 5. ローカル開発サーバーを起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173/mlm-org-chart/` を開く。

---

## GitHub Pages へのデプロイ

### 1. GitHub Secrets を設定

リポジトリ → Settings → Secrets and variables → Actions → **New repository secret** で以下を登録：

| Secret名 | 値 |
|---|---|
| `VITE_FIREBASE_API_KEY` | FirebaseのapiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | FirebaseのauthDomain |
| `VITE_FIREBASE_PROJECT_ID` | FirebaseのprojectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | FirebaseのstorageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FirebaseのmessagingSenderId |
| `VITE_FIREBASE_APP_ID` | FirebaseのappId |

### 2. GitHub Pages を有効化

リポジトリ → Settings → Pages → Source を **GitHub Actions** に設定。

### 3. main ブランチにプッシュ

```bash
git add .
git commit -m "initial commit"
git push origin main
```

Actions タブで自動ビルド&デプロイが走ります。完了後は以下のURLでアクセス可能：

```
https://<your-username>.github.io/mlm-org-chart/
```

### 4. Firebase の承認済みドメインに追加

Firebase Console → Authentication → Settings → 承認済みドメイン → `<your-username>.github.io` を追加。

---

## 操作方法

### ノード追加
- **PC**: ノードにマウスオーバー → 下に表示される **＋** ボタンをクリック
- **スマホ**: ノードを500ms長押し → ＋ボタンをタップ

### ノード編集
- ノードをクリック → 右側の編集パネルで名前・役職・写真を変更 → **保存**

### ノード削除
- **PC**: ノードにマウスオーバー → 右上の **🗑️** ボタンをクリック
- 削除すると配下のメンバーも一緒に削除されます

### ドラッグ&ドロップ（移動）
- ノードをドラッグ → 緑の点線ゾーンにドロップ
- 移動前に確認ダイアログが表示されます
- ルートノードはドラッグ不可

### 元に戻す
- 右上の **元に戻す** ボタン または `Ctrl+Z` / `Cmd+Z`

### 画面操作
- **ズーム**: マウスホイール / ピンチ
- **パン**: 背景をドラッグ
- **全体表示**: 右下の **⊞ 全体表示** ボタン

---

## 技術スタック

| 技術 | 用途 |
|---|---|
| React 18 + Vite | UIフレームワーク |
| Firebase v10 | 認証・データベース |
| Zustand | 状態管理 |
| Tailwind CSS | スタイリング |
| GitHub Actions | 自動デプロイ |

## ライセンス

MIT
