"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, AudioLines, Check, ChevronRight, CircleHelp, Clock3, Fingerprint, FlaskConical, LockKeyhole, MousePointer2, RotateCcw, Settings2, Share2, ShieldCheck, Sparkles, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { getMessage, getMilestone, getTodayCount, type Preferences, type PressKind } from "@/lib/regret";
import { attemptUndo, pressRegret, resetRegrets, setPreference, useRegretStore } from "@/lib/store";
import { playFeedback, prepareAudio } from "@/lib/feedback";
import { SITE_URL } from "@/lib/site";
import { useButtonGesture } from "@/hooks/use-button-gesture";
import { useButtonSpring } from "@/hooks/use-button-spring";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { PrivateAnalytics, trackRegret } from "./analytics";
import { Dialog } from "./dialog";
import { SettingsDialog } from "./settings-dialog";

const formatCount = (value: number) => value < 1000 ? String(value).padStart(3, "0") : value.toLocaleString("ja-JP");

export function RegretLab() {
  const { record, ready, storageError } = useRegretStore();
  const systemReduced = useReducedMotion();
  const reduceMotion = systemReduced || record.preferences.reduceMotion;
  const [dialog, setDialog] = useState<"settings" | "about" | "share" | null>(null);
  const [deepAt, setDeepAt] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<100 | 500 | 1000 | null>(null);
  const [undoFeedback, setUndoFeedback] = useState(false);
  const [notice, setNotice] = useState("");
  const [shareText, setShareText] = useState("");
  const [sharing, setSharing] = useState(false);
  const shareBusy = useRef(false);
  const mainButtonRef = useRef<HTMLButtonElement>(null);
  const buttonVisualRef = useRef<HTMLSpanElement>(null);
  const deep = deepAt !== null && deepAt === record.total && record.total > 0;
  const message = getMessage(record.total, deep);
  const { move: moveButton, reset: resetButton } = useButtonSpring(buttonVisualRef, ready && record.preferences.escapeButton && !reduceMotion);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  function press(kind: PressKind) {
    if (!ready) return;
    const next = pressRegret(kind);
    const achieved = getMilestone(next.total);
    setDeepAt(kind === "deep" ? next.total : null);
    setUndoFeedback(false);
    if (achieved) setMilestone(achieved);
    playFeedback(kind, next.preferences, achieved);
    trackRegret(kind === "deep" ? "long_press" : "button_press");
    if (achieved) trackRegret("milestone", { milestone: achieved });
  }

  function startPress() {
    resetButton();
    if (record.preferences.sound) prepareAudio();
  }

  const gesture = useButtonGesture(press, startPress);

  function changePreference(key: keyof Preferences, value: boolean) {
    setPreference(key, value);
    if (key === "sound" && value) {
      prepareAudio();
      playFeedback("normal", { ...record.preferences, sound: true, haptics: false });
    }
  }

  function reset() {
    resetRegrets();
    setDeepAt(null);
    setMilestone(null);
    setUndoFeedback(false);
    setNotice("記録をリセットしました。まっさらな後悔を、どうぞ。");
  }

  async function share() {
    if (shareBusy.current) return;
    shareBusy.current = true;
    setSharing(true);
    const text = record.total === 0 ? "押しても何も起きないのに、押したくなる。『後悔ボタン』" : `『後悔ボタン』を${record.total.toLocaleString("ja-JP")}回押しました。特に何も起きませんでした。`;
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "後悔ボタン", text, url: SITE_URL });
          trackRegret("share", { method: "native" });
          setNotice("小さな後悔を、共有しました。");
          return;
        } catch (error) {
          if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") return;
        }
      }
      const copy = `${text}\n${SITE_URL}`;
      try {
        await navigator.clipboard.writeText(copy);
        trackRegret("share", { method: "clipboard" });
        setNotice("共有文とURLをコピーしました。");
      } catch {
        setShareText(copy);
        setDialog("share");
      }
    } finally {
      shareBusy.current = false;
      setSharing(false);
    }
  }

  function undo() {
    if (attemptUndo()) setUndoFeedback(true);
  }

  const time = record.lastPressedAt ? new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(record.lastPressedAt)) : "— — : — —";
  const date = record.lastPressedAt ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric" }).format(new Date(record.lastPressedAt)) : "まだ押していません";
  const today = ready ? getTodayCount(record) : 0;
  const title = undoFeedback ? "取り消せません" : record.total === 0 ? "まだ、引き返せます。" : message.title;
  const detail = undoFeedback ? "これは演出です。本当のリセットは、設定からどうぞ。" : record.total === 0 ? "押さないという選択も、立派な選択です。" : message.detail;

  return (
    <div className={`lab-app${deep ? " is-deep" : ""}`} data-reduced-motion={reduceMotion ? "true" : "false"}>
      <a href="#experiment" className="skip-link">ボタンへ移動</a>
      <header className="site-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><div><span className="brand-name">後悔ボタン<span className="brand-period">.</span></span><span className="brand-caption">REGRET RESEARCH LAB</span></div></div>
        <nav className="header-actions" aria-label="実験室メニュー">
          <button className="about-button" aria-label="この実験について" onClick={() => setDialog("about")}><CircleHelp size={16} aria-hidden="true" /><span>この実験について</span></button>
          <span className="header-divider" aria-hidden="true" />
          <button className="icon-button sound-toggle" aria-label={`サウンドを${record.preferences.sound ? "オフ" : "オン"}にする`} aria-pressed={record.preferences.sound} onClick={() => changePreference("sound", !record.preferences.sound)} disabled={!ready}>{record.preferences.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
          <button className="icon-button" aria-label="設定を開く" onClick={() => setDialog("settings")}><Settings2 size={20} /></button>
        </nav>
      </header>

      <main id="experiment" className="main-content">
        <section className="intro" aria-labelledby="main-title">
          <p className="experiment-label"><span aria-hidden="true" />EXPERIMENT 001</p>
          <h1 id="main-title">押しても、<span className="mobile-break"><br /></span>何も起きません。</h1>
          <p className="intro-copy">それでも、押したくなるんですよね。</p>
        </section>

        <section className={`experiment-panel${gesture.pressed ? " is-pressing" : ""}`} aria-label="後悔の実験装置">
          <div className="panel-topline"><span className="mono">RB—001<span className="panel-top-divider">/</span>MANUAL OVERRIDE</span><span className="safe-indicator"><span />{deep ? "DEEP REGRET" : "SYSTEM NORMAL"}</span></div>
          <div className="button-stage" onPointerMove={moveButton} onPointerLeave={resetButton}>
            <div className="instrument instrument-left" aria-hidden="true"><span>INPUT</span><span className="instrument-line" /><strong>好奇心</strong><span className="instrument-small">CURIOSITY</span></div>
            <div className="button-assembly">
              <div className="orbit orbit-outer" aria-hidden="true" /><div className="orbit orbit-inner" aria-hidden="true" />
              <div className="orbit-cross cross-top" aria-hidden="true" /><div className="orbit-cross cross-bottom" aria-hidden="true" /><div className="orbit-cross cross-left" aria-hidden="true" /><div className="orbit-cross cross-right" aria-hidden="true" />
              <div className="button-plinth">
                <button ref={mainButtonRef} className="regret-button" {...gesture.handlers} disabled={!ready} aria-label="押さないでください" aria-describedby="button-help" data-pressed={gesture.pressed ? "true" : "false"}>
                  <span ref={buttonVisualRef} className="button-visual"><span className="button-surface"><Fingerprint size={30} strokeWidth={1.25} aria-hidden="true" /><span className="button-japanese">押さないでください</span><span className="button-english">DO NOT PRESS</span><span className="button-highlight" aria-hidden="true" /></span></span>
                </button>
              </div>
              <div className={`hold-track${gesture.holding ? " is-holding" : ""}`} aria-hidden="true"><span /></div>
            </div>
            <div className="instrument instrument-right" aria-hidden="true"><span>OUTPUT</span><span className="instrument-line" /><strong>何もなし</strong><span className="instrument-small">ABSOLUTELY NOTHING</span></div>
            <div className="stage-caption"><TriangleAlert size={12} aria-hidden="true" /><span>{gesture.holding ? "そのまま、1.2秒。" : deep ? "深さが変わっても、結果は同じです。" : "ご安心ください。危険性はありません。"}</span></div>
          </div>

          <div className="response-display" role="status" aria-live="polite" aria-atomic="true">
            <div className="response-eyebrow"><span className="response-dot" /><span>{deep ? "DEEP OBSERVATION" : "OBSERVATION LOG"}</span><span className="response-index mono">{record.total === 0 ? "STANDBY" : `NO. ${String(record.total).padStart(4, "0")}`}</span></div>
            <p className="response-title" key={`${record.total}-${deep}-${undoFeedback}`}>{title}</p><p className="response-detail">{detail}</p>
          </div>

          <div className="panel-bottomline" id="button-help"><span><MousePointer2 size={14} aria-hidden="true" />タップ / クリックで押す</span><span className="hint-separator" aria-hidden="true" /><button onClick={() => { startPress(); press("deep"); }} disabled={!ready} aria-label="長押しせずに、より深い後悔を体験する"><Fingerprint size={15} aria-hidden="true" /><span>1.2秒長押しで、より深い後悔</span><ChevronRight size={12} aria-hidden="true" /></button></div>
          <span className="panel-screw screw-tl" aria-hidden="true" /><span className="panel-screw screw-tr" aria-hidden="true" /><span className="panel-screw screw-bl" aria-hidden="true" /><span className="panel-screw screw-br" aria-hidden="true" />
        </section>

        <section className="stats-grid" aria-label="この端末の記録">
          <div className="stat"><div className="stat-label"><span className="stat-tiny-dot" />この端末で押した累計</div><div className={`stat-value${record.total > 99999 ? " stat-value-small" : ""}`} data-testid="total-count" aria-label={`${record.total}回`}><span>{formatCount(record.total)}</span><small>回</small></div><p className="stat-note">積み重ねた、小さな後悔。</p></div>
          <div className="stat"><div className="stat-label"><span className="stat-tiny-dot" />本日の回数</div><div className={`stat-value${today > 99999 ? " stat-value-small" : ""}`} data-testid="today-count" aria-label={`${today}回`}><span>{formatCount(today)}</span><small>回</small></div><p className="stat-note">今日も、平和です。</p></div>
          <div className="stat stat-time"><div className="stat-label"><Clock3 size={12} />前回押した時刻</div><div className={`stat-value time-value${record.lastPressedAt ? " has-time" : ""}`} data-testid="last-pressed"><span>{time}</span></div><p className="stat-note">{date}</p></div>
        </section>

        <div className="below-panel"><div className="regret-level"><span className="level-bars" aria-hidden="true">{[1, 2, 3, 4, 5].map(level => <i key={level} data-active={level <= message.level} />)}</span><span>後悔レベル</span><strong>{message.label}</strong></div><div className="milestones" aria-label="特別演出の節目">{[100, 500, 1000].map(value => <span key={value} data-reached={record.total >= value}><Sparkles size={11} aria-hidden="true" />{value.toLocaleString("ja-JP")}</span>)}</div></div>

        <div className="action-row"><button className="share-button" onClick={() => void share()} disabled={!ready || sharing}><Share2 size={16} />この後悔を共有<ArrowUpRight size={15} /></button>{record.total > 0 && !record.undoUsed ? <button className="undo-button" onClick={undo}><RotateCcw size={13} />1回だけ取り消す<span>演出</span></button> : <span className="quiet-aside">{record.undoUsed ? "本当のリセットは、設定から。" : "押さない自由も、あります。"}</span>}</div>
        {storageError ? <p className="storage-warning" role="alert"><TriangleAlert size={15} />{storageError}</p> : null}
        <div className="privacy-note"><LockKeyhole size={12} /><span>回数と時刻は、このブラウザだけに保存されます。</span></div>
      </main>

      <footer className="site-footer"><span className="mono">DESIGNED TO DO NOTHING.</span><span>役に立たない、を丁寧に。<span className="footer-version mono">v1.0</span></span></footer>

      <SettingsDialog open={dialog === "settings"} onClose={() => setDialog(null)} preferences={record.preferences} onPreference={changePreference} onReset={reset} systemReduced={systemReduced} onDeep={() => { startPress(); press("deep"); }} />
      <Dialog open={dialog === "about"} onClose={() => setDialog(null)} titleId="about-title" label="この実験について" className="about-dialog">
        <span className="dialog-symbol"><FlaskConical size={25} /></span><p className="eyebrow">A SMALL, HARMLESS EXPERIMENT</p><h2 id="about-title">何もしない、<br />という実験。</h2><p className="dialog-intro">「押さないで」と言われると、押したくなる。<br />そんな好奇心のための、小さな実験室です。</p>
        <div className="about-section"><ShieldCheck size={20} /><div><h3>増えるのは、数字だけ。</h3><p>課金や広告、勝手な外部移動はありません。位置情報・連絡先・カメラなどの権限も取得しません。物騒な言葉は、すべて演出です。</p></div></div>
        <div className="about-section"><LockKeyhole size={20} /><div><h3>あなたの記録は、あなたの端末に。</h3><p>回数・時刻・設定をlocalStorageに保存します。Vercel Analyticsにはページ表示と操作の種類・節目のみを送信し、設定から停止できます。共有時だけ、選んだ共有先に回数とURLを渡します。</p></div></div>
        <div className="about-section"><AudioLines size={20} /><div><h3>音も、動きも、お好みで。</h3><p>音は自作の電子音で、初期状態はオフ。キーボードのSpace・Enterでも押せます。長押しが難しければ、ボタン下の案内や設定から同じ体験ができます。</p></div></div>
        <p className="about-pwa">ホーム画面に追加すると、アプリのように使えます。一度オンラインで開けば、オフラインでも。記録はブラウザごとに別々です。</p>
        <button className="secondary-button about-return" onClick={() => setDialog(null)}>実験室に戻る<ArrowUpRight size={15} /></button>
      </Dialog>

      <Dialog open={milestone !== null} onClose={() => setMilestone(null)} titleId="milestone-title" label="記念演出" className={`milestone-dialog milestone-${milestone ?? 100}`}>
        <div className="milestone-rays" aria-hidden="true" /><p className="eyebrow">A PERFECTLY USELESS ACHIEVEMENT</p><div className="milestone-medallion" aria-hidden="true"><Sparkles size={27} /><span>{milestone?.toLocaleString("ja-JP")}</span><small>REGRETS, ZERO CONSEQUENCES</small></div><p className="milestone-overline">MILESTONE REACHED</p><h2 id="milestone-title">{milestone === 1000 ? "何も起きない、伝説へ。" : milestone === 500 ? "後悔も、ここまで来ました。" : "100回の、小さな後悔。"}</h2><p className="milestone-description">{milestone?.toLocaleString("ja-JP")}回押しても、世界は変わりませんでした。<br />ただ、あなたの好奇心は本物でした。</p><div className="milestone-actions"><button className="milestone-share" onClick={() => void share()} disabled={sharing}><Share2 size={16} />この後悔を共有</button><button className="text-button" onClick={() => { setMilestone(null); mainButtonRef.current?.focus(); }}>実験室に戻る<ChevronRight size={14} /></button></div>
      </Dialog>

      <Dialog open={dialog === "share"} onClose={() => setDialog(null)} titleId="share-title" label="共有" className="share-dialog"><p className="eyebrow">SHARE YOUR REGRET</p><h2 id="share-title">小さな後悔を、おすそわけ。</h2><p className="dialog-intro">このブラウザでは自動コピーができません。以下を選択してコピーしてください。</p><textarea className="share-text" readOnly value={shareText} aria-label="共有する文章とURL" onFocus={event => event.currentTarget.select()} /><button className="secondary-button" onClick={() => { trackRegret("share", { method: "manual" }); setDialog(null); }}>完了</button></Dialog>
      <div className={`toast${notice ? " toast-visible" : ""}`} role="status" aria-live="polite">{notice ? <><Check size={16} /><span>{notice}</span></> : null}</div>
      <PrivateAnalytics />
    </div>
  );
}
