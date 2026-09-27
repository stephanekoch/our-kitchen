"use client";

import { Icon } from "./Icon";

export type CookStats = { times: number; week: number; streak: number };

const STARS: [number, number, number, number][] = [
  [8, 14, 0.5, 30], [74, 4, 0.7, 36], [2, 58, 0.9, 22], [80, 54, 1.1, 26], [44, -4, 1.3, 20],
];

/** "Clean plate!" — shown when every step is ticked. */
export function Celebration({ title, stats, onDone }: { title: string; stats: CookStats | null; onDone: () => void }) {
  const times = stats?.times ?? 1;
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
      <div className="celebrate-art" aria-hidden="true">
        {[40, 50, 60].map((x, i) => (
          <span key={x} className="steam" style={{ left: `${x}%`, animationDelay: `${i * 0.5}s` }} />
        ))}
        {STARS.map(([x, y, d, s], i) => (
          <svg key={i} className="star" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} width={s} height={s} viewBox="0 0 24 24">
            <path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z" fill="#F2B544" />
          </svg>
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-512.png" alt="" width={170} height={170} className="celebrate-panda" />
      </div>
      <h2 id="celebrate-title" style={{ animationDelay: "0.5s" }}>Clean plate!</h2>
      <p style={{ animationDelay: "0.7s" }}>
        {times > 1 ? `You've cooked ${title} ${times} times.` : `First time cooking ${title}. Nice!`}
      </p>
      <div className="row wrap" style={{ justifyContent: "center", gap: 8, animation: "fadein .5s ease-out .9s both" }}>
        {stats && stats.streak > 1 && <span className="stat">{stats.streak}-day streak</span>}
        {stats && <span className="stat">{stats.week} cooked this week</span>}
        <span className="stat stat-new">+1 today</span>
      </div>
      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 18, maxWidth: 360 }} onClick={onDone}>
        <Icon name="check" /> Done
      </button>
    </div>
  );
}
