# Brain Board for Obsidian

## これは何？
大量のコンテキストや息の長いタスクを抱える「Second Brain」運用において、タスクや AI (Claude Code) セッションが埋もれてしまう問題（Task Burial）を防ぎ、直感的かつ確実に処理していくための **統合カンバンボード・タスク管理プラグイン** です。

ObsidianとClaude Codeを横断して「今やるべきこと」を俯瞰し、不要な管理コストと摩擦をゼロにすることを目的として作られました。

## 主な機能

### タスクの賢い永続化と可視化
- **Smart Persistence（賢い永続化）**: デフォルトの `taskScanPeriod` (スキャン期間) にかかわらず、「No Status」以外のレーン（Todo, Doing等）に配置したタスクは自動で永続化され、消えずに残り続けます。これにより、息の長い読書や開発タスクを安全に放置・管理できます。
- **Visual Aging（放置タスクの可視化）**: 各レーンに滞在している日数に応じて、各種カードの左端のボーダー色が変化（黄色・オレンジ・赤）し、対応漏れや「腐りかけ」のタスクをひと目で把握できます。

### 直感的で高速な操作
- **Drag-Select & Bulk Actions（ドラッグ複数選択と一括操作）**: 何もない背景からドラッグして範囲選択（Lasso Select）したり、Shift+Click / Cmd+Click で複数カードをまとめて選択し、他のレーンへ一括移動できます。
- **ドラッグ＆ドロップ**: タスクやセッションのカードはもちろん、タブ自体の並び順もドラッグ＆ドロップで自由に変更可能です。

### Obsidian と Claude の統合
- **ダブルボード構成**: Claude Code のセッションを管理する「Claude」タブと、Obsidian 上の日々のタスクを管理する「Obsidian」タブを一つのビューに統合。
- **タスクの双方向同期**: ボードでタスクを完了レーンに移動させると、Markdownノート上のチェックボックス(`- [ ]` ↔ `- [x]`)も自動で更新。逆にノートを書き換えればボードにも即座に同期・反映されます。
- **カスタマイズ可能なレーン**: 自身のワークフローに合わせて、レーンの追加・名前変更・削除が可能です。

## インストール方法

1. リリースページ（Releases）から `main.js`, `manifest.json`, `styles.css` をダウンロードします。
2. ObsidianのVault内の `.obsidian/plugins/brain-board/` フォルダに配置します。
3. Obsidianを再起動またはリロードし、コミュニティプラグイン設定から「Brain Board」を有効化します。

## 設定

- **Claude Directory Path**: Claude Codeの `.claude` ディレクトリの絶対パス（デフォルト: `~/.claude`）。
- **Task Search Directory**: タスクスキャンの対象とするVault内の特定のフォルダ（例: `10_Journal`）。空にするとVault全体をスキャンします。
- **Task Scan Period (days)**: 直近何日間に更新されたファイルのタスクをスキャン対象とするか。ただし「No Status」以外のレーンに置かれたタスクは、この期間設定を無視して**永続的**に追跡されます。
- **Storage Directory**: ボードのレーン状態等を保存する `sessions.json` の場所（デフォルト: `.brain-board`）。

## ライセンス

MIT
