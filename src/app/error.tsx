"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="error-page"><span className="eyebrow">EXPERIMENT PAUSED</span><h1>実験室を、ひと休み。</h1><p>画面を表示できませんでした。端末の記録は自動では消えません。</p><button onClick={reset} className="secondary-button">もう一度表示する</button></main>;
}
