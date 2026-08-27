"use client";

import { useState } from "react";
import { AudioLines, Fingerprint, MousePointer2, Eye, ChartNoAxesColumn, RotateCcw, ShieldCheck } from "lucide-react";
import type { Preferences } from "@/lib/regret";
import { Dialog } from "./dialog";

const settings = [
  { key: "sound", title: "サウンド", detail: "小さな電子音。音量は控えめです。", Icon: AudioLines },
  { key: "haptics", title: "バイブレーション", detail: "対応する端末で、短く振動します。", Icon: Fingerprint },
  { key: "escapeButton", title: "ボタンが少し逃げる", detail: "マウスを近づけると、ほんの少しだけ。", Icon: MousePointer2 },
  { key: "reduceMotion", title: "動きを減らす", detail: "移動や広がる演出を止めます。", Icon: Eye },
  { key: "analytics", title: "匿名の利用状況を送る", detail: "ページ表示・操作の種類・節目のみ。", Icon: ChartNoAxesColumn },
] as const;

export function SettingsDialog({ open, onClose, preferences, onPreference, onReset, systemReduced, onDeep }: {
  open: boolean; onClose: () => void; preferences: Preferences; onPreference: (key: keyof Preferences, value: boolean) => void; onReset: () => void; systemReduced: boolean; onDeep: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const close = () => { setConfirmReset(false); onClose(); };
  return (
    <Dialog open={open} onClose={close} titleId="settings-title" label="設定" className="settings-dialog">
      <p className="eyebrow">CONTROL ROOM</p>
      <h2 id="settings-title">あなたのペースで。</h2>
      <p className="dialog-intro">後悔のしかたは、いつでも変えられます。</p>
      <div className="settings-list">
        {settings.map(({ key, title, detail, Icon }) => (
          <div className="setting-row" key={key}>
            <Icon size={19} aria-hidden="true" />
            <div className="setting-copy"><label id={`setting-${key}`}>{title}</label><p id={`setting-description-${key}`}>{detail}</p></div>
            <button type="button" role="switch" aria-checked={preferences[key]} aria-labelledby={`setting-${key}`} aria-describedby={`setting-description-${key}`} className="switch" onClick={() => onPreference(key, !preferences[key])}><span /></button>
          </div>
        ))}
      </div>
      <div className="accessibility-note">
        <ShieldCheck size={16} aria-hidden="true" />
        <p>{systemReduced ? "端末の「視差効果を減らす」を検出しました。動きと逃げる演出は自動で停止しています。" : "端末のReduced Motion設定も、自動で尊重します。"}</p>
      </div>
      <button className="text-button accessible-deep" onClick={() => { close(); onDeep(); }}>長押しせずに「より深い後悔」を体験する <span aria-hidden="true">↗</span></button>
      <section className="reset-section" aria-labelledby="reset-title">
        <div className="flex items-center gap-2"><RotateCcw size={17} /><h3 id="reset-title">本当に、リセットする。</h3></div>
        <p>この端末の回数・前回の時刻を消去します。設定は残ります。他のサイトのデータには触れません。</p>
        {confirmReset ? (
          <div className="reset-confirmation">
            <p role="alert">消した記録は戻せません。リセットしますか？</p>
            <div className="flex flex-wrap gap-2"><button className="danger-button" onClick={() => { onReset(); close(); }}>記録をリセット</button><button className="secondary-button" onClick={() => setConfirmReset(false)}>キャンセル</button></div>
          </div>
        ) : <button className="reset-button" onClick={() => setConfirmReset(true)}>記録をリセットする</button>}
      </section>
      <p className="settings-footnote">音はWeb Audio APIで生成。録音された効果音は使用していません。計測はDo Not Trackにも対応しています。</p>
    </Dialog>
  );
}
