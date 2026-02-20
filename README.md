# Brain Board for Obsidian

Claude Codeのセッションを要約・追跡する機能と、Obsidianのタスク管理を統合するカンバンボードプラグインです。

## 主な機能

- **ダブルボード構成**: Claude Codeのセッションを管理する「Claude」タブと、日々のタスクを管理する「Obsidian」タブを搭載。
- **ドラッグ＆ドロップ**: タスクやセッションのカードを、Todo、Doing、Done等のレーンへ直感的に移動。
- **タスクの自動同期**: ボードでタスクを移動させると、Markdownノート上のチェックボックス(`- [ ]` ↔ `- [x]`)も自動で更新。逆にノートを書き換えればボードにも即座に反映されます。
- **カスタマイズ可能なレーン**: ワークフローに合わせてレーンの追加・名前変更・削除が可能。
- **タブの入れ替え**: ドラッグ＆ドロップでタブ自体の並び順も自由に変更可能です。

## インストール方法

1. リリースページ（Releases）から `main.js`, `manifest.json`, `styles.css` をダウンロードします。
2. ObsidianのVault内の `.obsidian/plugins/brain-board/` フォルダに配置します。
3. Obsidianを再起動またはリロードし、コミュニティプラグイン設定から「Brain Board」を有効化します。

## 設定

- **Claude Path**: Claude Codeの `.claude` ディレクトリの場所（デフォルト: `~/.claude`）。
- **Task Search Directory**: タスクスキャンの対象とするVault内の特定のフォルダ（例: `10_Journal`）。空にするとVault全体をスキャンします。
- **Storage Directory**: ボードのレーン状態等を保存する `sessions.json` の場所（デフォルト: `.brain-board`）。

## ライセンス

MIT
