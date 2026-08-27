# 検証記録

検証日: **2026-08-27（JST）**

- 公開アプリ: https://regret-button.vercel.app
- 公開リポジトリ: https://github.com/shunsoco-stack/regret-button
- Next.js 16.3.3 / React 19.2.8 / Node.js 24.x

## 自動検証

| 項目 | 結果 |
| --- | --- |
| `npm run lint` | 成功。警告0件 |
| `npm run typecheck` | 成功。Next.js型生成＋TypeScript |
| `npm test` | 6ファイル・157テスト成功 |
| `npm run build` | ローカル・Vercelの本番ビルドとも成功 |
| `npm run secret-scan` | 検出0件。ソース・設定・ドキュメント・lockfileを検査 |
| Gitleaks 8.30.1 | 公開対象の作業ツリーで検出0件。公式配布物のSHA-256も照合 |
| `npm audit` | インストールした全依存で脆弱性0件（実行時点） |
| GitHub Secret Scanning / Push Protection | 公開リポジトリで有効化済み |
| GitHub Actions | 実行結果を最終公開時に追記 |

### テスト範囲

| テストファイル | 件数 | 主な確認 |
| --- | --- | --- |
| `regret.test.ts` | 52 | 集計、日跨ぎ、節目、破損データ・不正数値、設定を保持するリセット |
| `store.test.ts` | 24 | 保存・復元、hydration、別タブ、Quota/SecurityError、他のキーを消さないリセット |
| `gesture.test.tsx` | 28 | 1.2秒長押しの1カウント、通常操作、Space/Enter、キャンセル、repeat、後続clickの二重加算防止 |
| `feedback.test.ts` | 17 | 操作前にAudioを生成しない、音オフ、振動非対応、例外、ノード清掃 |
| `service-worker.test.ts` | 19 | キャッシュ準備、模擬オフライン再表示、他アプリのキャッシュ保護、対象リクエストの制限 |
| `regret-lab.test.tsx` | 17 | 画面統合、本当のリセット、100/500/1000のダイアログ、共有成功・キャンセル・各fallback、イベント送信・停止・DNT |

追加のUIテストでDOMExceptionの共有キャンセル分岐を修正し、コピーや計測へ進まないことを再確認しました。作成途中のテストが初回Vercelビルドに含まれた際の型エラーも修正済みで、その後の本番デプロイは成功しています。

## 実ブラウザで確認

| 環境・操作 | 結果 |
| --- | --- |
| ローカル本番ビルドの1回押下・再読み込み | `001`になり、再読み込み後も保持 |
| 取り消し演出 | 「取り消せません」。回数は不変 |
| 深い後悔の代替操作 | 1回だけ増え、色とメッセージが深い後悔に切り替わる |
| 390px / 320px幅 | メイン操作と設定が表示され、320pxでも横スクロールなし |
| 動きを減らす設定 | `data-reduced-motion=true` を確認 |
| Spaceキー | 通常押下で1回だけ増える |
| 公開URLで初期→1→25→深い後悔26→100 | 各回数とメッセージを確認。100回記念ダイアログを実操作で表示 |
| 公開URLで再読み込み | 累計100回を保持 |
| 公開URLでOS共有を開きキャンセル | 共有ボタンが再び有効になり、エラーなし。外部の共有先への投稿はしていない |
| 上記公開操作のブラウザログ | 確認した範囲でerror/warn 0件 |

## 公開ファイル

ホーム、`manifest.webmanifest`、`favicon.ico`、`icon.svg`、192/512/maskable/apple-touchアイコン、`og.png`、`sw.js`、`robots.txt`、`sitemap.xml`、`/_vercel/insights/script.js`のHTTP 200とContent-Typeを確認しました。

ホームのOG URL、`X-Frame-Options: DENY`、Service Workerの`Cache-Control: no-cache, no-store, must-revalidate`も確認済みです。

## Vercel Analyticsの制約

Web Analyticsはプロジェクトで有効化済みで、公開サイトのSDKスクリプトもHTTP 200です。送信コードは以下の4種類に対応し、UI統合テストで呼び出しと送信停止を検証しています。

- `button_press`: 通常押下
- `long_press`: 長押しまたはアクセシビリティ用の代替操作
- `share`: OS共有成功、コピー成功、または手動コピー画面で「完了」
- `milestone`: 固定の100/500/1000到達

**現在のVercel契約はHobbyです。** カスタムイベント集計APIは「ProまたはEnterpriseが必要」としてアクセスを拒否しました。したがって、カスタムイベントの受信・集計をダッシュボード/APIで確認したとは扱いません。有料プランへの変更は利用者の承認が必要であり、この公開作業では実施していません。

URLのquery/hashを除外し、route/pathも`/`に固定しています。任意の累計回数、前回時刻、端末記録、独自識別子は送りません。設定オフ・DNT有効時の抑止はコードと自動テストで確認済みです。共有キャンセルでは`share`を送信しません。

## 公開後スクリーンショット

2026-08-27に **https://regret-button.vercel.app** の実画面から取得。ローカル画面や作図による代替ではなく、画像加工も行っていません。

| 画面 | ファイル | 状態 |
| --- | --- | --- |
| 初期画面 | `public/screenshots/01-initial.png` | 0回 |
| 1回押した状態 | `public/screenshots/02-first-press.png` | 1回・「本当に押したんですね」 |
| 連打後 | `public/screenshots/03-repeated-press.png` | 25回 |
| 長押しモード | `public/screenshots/04-deep-regret.png` | 26回・代替操作で同じモードへ入って撮影 |
| 100回記念 | `public/screenshots/05-milestone-100.png` | 実際に100回へ到達しダイアログを撮影 |

最初の4枚はページ全体、5枚目はダイアログが表示されたビューポートです。READMEに5枚とも掲載しています。

## 実機・外部条件として残る確認

- 実機での音の聞こえ方・振動の感触、タッチ長押し、ホーム画面への追加。APIの自動テストを実機確認とは扱いません。
- 実ブラウザのネットワークを切った後の操作。Service Workerの模擬ネットワーク検証は成功していますが、物理的な回線断の確認ではありません。
- 500/1000回への実ブラウザでの連続操作。境界と記念ダイアログはUI統合テストで確認済みです。
- 有料プランでのカスタムイベント集計・受信確認。現在はプラン制限があります。

Secret Scanは未知の秘密形式や画像内部まで安全を証明する検査ではありません。詳しい検査範囲は[security.md](security.md)を参照してください。
