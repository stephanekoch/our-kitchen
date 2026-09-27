"use client";

import { useState } from "react";
import type { BabyWarning } from "@/lib/client/types";
import { Icon } from "./Icon";

export function FlagTags({ r, long = false }: { r: { baby_friendly: boolean; easy: boolean; quick: boolean; freezes_well: boolean }; long?: boolean }) {
  return (
    <>
      {r.baby_friendly && <span className="tag tag-baby">{long ? "Baby-friendly" : "Baby"}</span>}
      {r.easy && <span className="tag tag-easy">Easy</span>}
      {r.quick && <span className="tag tag-quick">Quick</span>}
      {r.freezes_well && <span className="tag tag-freezes">{long ? "Freezes well" : "Freezes"}</span>}
    </>
  );
}

/** Recipe photo, or a warm tile with a bowl when there's no photo (or it fails to load). */
export function Photo({ src, className, iconSize = 30 }: { src: string | null | undefined; className: string; iconSize?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={className}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Icon name="bowl" size={iconSize} stroke={1.6} />
      )}
    </div>
  );
}

export function BabyPanel({ warnings, babyFriendly }: { warnings: BabyWarning[]; babyFriendly: boolean }) {
  const avoid = warnings.filter((w) => w.level === "avoid");
  const check = warnings.filter((w) => w.level === "check");
  if (!warnings.length) {
    return babyFriendly ? (
      <div className="panel panel-ok">
        <Icon name="checkCircle" />
        <div>
          <strong>Baby check passed</strong>
          No added salt, honey or whole nuts.
        </div>
      </div>
    ) : null;
  }
  const list = [...avoid, ...check];
  return (
    <div className={`panel ${avoid.length ? "panel-avoid" : "panel-warn"}`}>
      <Icon name="alert" />
      <div>
        <strong>{avoid.length ? "For the baby's portion, leave out:" : "For the baby's portion, check:"}</strong>
        <ul>
          {list.map((w) => (
            <li key={w.rule + w.ingredient}>
              <b>{w.ingredient}</b> — {w.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="row" role="status">
      <span className="spinner" />
      <span className="muted">{label}</span>
    </div>
  );
}
