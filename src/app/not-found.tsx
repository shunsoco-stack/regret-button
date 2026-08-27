import Link from "next/link";

export default function NotFound() {
  return <main className="error-page"><span className="eyebrow">EXPERIMENT NOT FOUND</span><h1>ここには、何もありません。</h1><p>ボタンのある部屋へ戻りましょう。</p><Link href="/" className="secondary-button">実験室に戻る</Link></main>;
}
