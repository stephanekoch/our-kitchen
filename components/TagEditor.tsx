"use client";

import { useState } from "react";
import type { KnownTag } from "@/lib/client/known";
import { Icon } from "./Icon";

/** Your own tags: tap ✕ to remove, type to add, with the tags you already use suggested first. */
export function TagEditor({ value, onChange, known }: { value: string[]; onChange: (tags: string[]) => void; known: KnownTag[] }) {
  const [text, setText] = useState("");
  const term = text.trim().toLowerCase();
  const suggestions = known
    .filter((k) => !value.includes(k.tag) && (!term || k.tag.includes(term)))
    .slice(0, term ? 6 : 8);
  const exact = known.some((k) => k.tag === term) || value.includes(term);

  const add = (tag: string) => {
    const t = tag.trim().toLowerCase().slice(0, 40);
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      {value.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          {value.map((t) => (
            <span key={t} className="tag-chip">
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
                <Icon name="x" size={16} stroke={2.4} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="add-row">
        <label className="sr-only" htmlFor="tag-input">Add a tag</label>
        <input
          id="tag-input"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (term) add(term);
            }
          }}
          placeholder="Add a tag, e.g. weeknight"
          autoComplete="off"
          enterKeyHint="done"
        />
        <button type="button" aria-label="Add tag" disabled={!term} onClick={() => add(term)}>
          <Icon name="plus" size={24} stroke={2.6} />
        </button>
      </div>
      {(suggestions.length > 0 || (term && !exact)) && (
        <div className="row wrap" style={{ gap: 6 }}>
          {suggestions.map((s) => (
            <button key={s.tag} type="button" className="suggest" onClick={() => add(s.tag)}>
              {s.tag}
            </button>
          ))}
          {term && !exact && (
            <button type="button" className="suggest suggest-new" onClick={() => add(term)}>
              New tag “{term}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
