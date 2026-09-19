# GFL2-Timeline-tool

ドールズフロントライン2「塵煙前線」の編成やTL（タイムライン）を共有するためのツールです。
本ツールは日本鯖のチーム「漆黒の宴」が管理、運営しています。

公開URL: https://aki490103.github.io/GFL2-Timeline-tool/

編成の内容はサーバーに保存されず、すべてURLのハッシュに埋め込まれます。
リンクを渡すだけで相手の画面に同じ編成が開きます。

## 開発

```sh
make install   # 依存パッケージのインストール
make dev       # 開発サーバーを起動
make test      # テストを実行
make lint      # Lint
make format    # フォーマット（共有URLの添字表の更新込み）
make lock      # 共有URLの添字表だけを更新する
```

`make help` で一覧が出ます。

`main` へのマージで GitHub Pages に自動デプロイされます（`.github/workflows/pages.yaml`）。

## 構成

```
tool/
  src/
    App.tsx          画面
    components/      汎用UI部品
    lib/             画面に依存しない純粋ロジック（テスト付き）
    data/            キャラ・武器・キー・召喚物のマスタ（テスト付き）
  public/            そのまま配信される静的ファイル
design/              OGP画像などのソース
```

## データを追加・修正するときの注意

`src/data/` の各リスト（キャラ・武器・キー・召喚物）は、**好きな位置に
追加・並び替えして構いません**。レアリティごとのまとまりを保ったまま
途中に挿入して大丈夫です。

共有URL（v2形式）はキャラ名やキー名を添字で持っていますが、その添字は
リスト本体ではなく**追記専用の添字表 `src/data/order-lock.ts`** を基準に
しています。両者が分かれているため、表示用のリストは自由に並べ替えられます。

```sh
# 1. src/data/*.ts の好きな位置にデータを追加する
# 2. 添字表に追記する（make format からも自動で走ります）
make lock
# 3. 差分（データ本体 + order-lock.ts）をコミットする
```

`order-lock.ts` は自動生成ファイルです。手で並び替え・削除しないでください。

- **追加** → `make lock` が添字表の末尾に追記します
- **改名** → `make lock` は止まります。`order-lock.ts` の**同じ位置**の文字列を
  書き換えてください（末尾に追記しない）
- **削除** → 添字表からは消さず、`order-lock.sync.test.ts` の `RETIRED` に
  名前を追加してください

添字表の更新漏れは `src/data/order-lock.sync.test.ts` が、配布済みURLが
壊れていないことは `src/lib/codec-compat.test.ts` が検出します。

また `src/data/data.test.ts` が、共通キーや召喚物の「（キャラ名）」部分が
実在するキャラかどうかなどを検査します。
