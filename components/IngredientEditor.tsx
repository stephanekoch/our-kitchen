"use client";

import { useMemo, useState } from "react";
import { nameKey, parseIngredientLine } from "@/lib/ingredients";
import { amount } from "@/lib/client/format";
import type { KnownIngredient } from "@/lib/client/known";
import { Icon } from "./Icon";

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

/** The part of what's typed that names the ingredient ("2 onio" → "onio"). */
function fragment(text: string): string {
  const p = parseIngredientLine(text);
  return (p.quantity != null || p.unit ? p.name : text).trim();
}

function suggest(text: string, known: KnownIngredient[]): KnownIngredient[] {
  const frag = fragment(text).toLowerCase();
  if (frag.length < 2) return [];
  const key = nameKey(frag);
  return known.filter((k) => k.name.toLowerCase() !== frag && (k.name.toLowerCase().includes(frag) || (key.length > 2 && k.key.includes(key)))).slice(0, 5);
}

function applySuggestion(text: string, name: string): string {
  const frag = fragment(text);
  const i = text.toLowerCase().lastIndexOf(frag.toLowerCase());
  return `${i >= 0 ? text.slice(0, i) : ""}${name}`.replace(/\s+/g, " ").trim();
}

function replaceName(line: string, from: string, to: string): string {
  const i = line.toLowerCase().indexOf(from.toLowerCase());
  return i >= 0 ? line.slice(0, i) + to + line.slice(i + from.length) : line;
}

function Suggestions({ items, onPick }: { items: KnownIngredient[]; onPick: (name: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="row wrap" style={{ gap: 6 }} aria-label="Ingredients you've used before">
      {items.map((k) => (
        <button key={k.key} type="button" className="suggest" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(k.name)}>
          {k.name}
        </button>
      ))}
    </div>
  );
}

/**
 * One row per ingredient. Typing suggests ingredients you've used before, and anything
 * the household hasn't used yet is marked "new" with the nearest match offered,
 * so "scallions" and "spring onions" end up as one ingredient.
 */
export function IngredientEditor({ value, onChange, known }: { value: string; onChange: (v: string) => void; known: KnownIngredient[] }) {
  const [asText, setAsText] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const lines = useMemo(() => value.split("\n").map((l) => l.trim()).filter(Boolean), [value]);
  const keys = useMemo(() => new Set(known.map((k) => k.key)), [known]);

  const setLines = (next: string[]) => onChange(next.join("\n"));
  const commit = () => {
    if (editing === null) return;
    const next = [...lines];
    if (draft.trim()) next[editing] = draft.trim();
    else next.splice(editing, 1);
    setLines(next);
    setEditing(null);
  };
  const add = () => {
    if (!adding.trim()) return;
    setLines([...lines, adding.trim()]);
    setAdding("");
  };

  if (asText) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <textarea className="textarea" rows={Math.max(6, lines.length + 2)} value={value} onChange={(e) => onChange(e.target.value)} placeholder={"200 g red lentils\n2 carrots, grated\n1 onion, chopped"} aria-label="Ingredients, one per line" />
        <button type="button" className="btn btn-quiet small" style={{ alignSelf: "flex-start" }} onClick={() => setAsText(false)}>
          Done — back to the list
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {lines.length > 0 && (
        <ul className="ing-rows">
          {lines.map((line, n) => {
            if (editing === n) {
              return (
                <li key={n} className="stack" style={{ gap: 6 }}>
                  <input
                    className="input"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commit();
                      }
                    }}
                    aria-label="Edit ingredient"
                    enterKeyHint="done"
                  />
                  <Suggestions items={suggest(draft, known)} onPick={(name) => setDraft(applySuggestion(draft, name))} />
                </li>
              );
            }
            const p = parseIngredientLine(line);
            const key = nameKey(p.name);
            const isNew = known.length > 0 && !keys.has(key);
            const nearest = isNew
              ? known.filter((k) => k.key.split(" ").pop() === key.split(" ").pop() || distance(k.key, key) <= 2).slice(0, 2)
              : [];
            const amt = amount(p.quantity, p.unit);
            return (
              <li key={n}>
                <div className="ing-row">
                  <button type="button" className="ing-main" onClick={() => { setEditing(n); setDraft(line); }} aria-label={`Edit ${line}`}>
                    {amt && <b>{amt}</b>}
                    <span>
                      {p.name}
                      {p.note && <span className="muted">, {p.note}</span>}
                    </span>
                    {isNew && <span className="tag tag-new">new</span>}
                  </button>
                  <button type="button" className="icon-btn ing-del" aria-label={`Remove ${p.name}`} onClick={() => setLines(lines.filter((_, i) => i !== n))}>
                    <Icon name="x" size={18} />
                  </button>
                </div>
                {nearest.length > 0 && (
                  <div className="row wrap" style={{ gap: 6, padding: "0 0 8px" }}>
                    <span className="small muted">Same as</span>
                    {nearest.map((k) => (
                      <button key={k.key} type="button" className="suggest" onClick={() => setLines(lines.map((l, i) => (i === n ? replaceName(l, p.name, k.name) : l)))}>
                        {k.name}?
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="add-row">
        <label className="sr-only" htmlFor="add-ingredient">Add an ingredient</label>
        <input
          id="add-ingredient"
          className="input"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add an ingredient, e.g. 2 onions"
          autoComplete="off"
          enterKeyHint="done"
        />
        <button type="button" aria-label="Add ingredient" disabled={!adding.trim()} onClick={add}>
          <Icon name="plus" size={24} stroke={2.6} />
        </button>
      </div>
      <Suggestions items={suggest(adding, known)} onPick={(name) => setAdding(applySuggestion(adding, name))} />
      <button type="button" className="btn btn-quiet small" style={{ alignSelf: "flex-start" }} onClick={() => setAsText(true)}>
        Paste or edit as text
      </button>
    </div>
  );
}
