"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlagTags, Photo } from "./bits";
import { Icon } from "./Icon";
import { duration } from "@/lib/client/format";
import type { RecipeSummary } from "@/lib/client/types";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Full-screen search: the box sits at the top, clear of the keyboard, and results
 * update on every keystroke (recipe names and ingredients, no waiting for the network).
 */
export function SearchOverlay({ recipes, onClose }: { recipes: RecipeSummary[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const words = norm(q).split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    const list = words.length
      ? recipes.filter((r) => {
          const hay = norm(`${r.title} ${r.search_text ?? ""}`);
          return words.every((w) => hay.includes(w));
        })
      : recipes;
    return [...list].sort((a, b) => a.title.localeCompare(b.title, "en-GB"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes, q]);

  return (
    <div className="search-screen" role="dialog" aria-modal="true" aria-label="Search recipes">
      <div className="search-top">
        <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}>
          <Icon name="back" stroke={2.4} />
        </button>
        <label className="search" style={{ flex: 1 }}>
          <Icon name="search" size={20} />
          <span className="sr-only">Search recipes or ingredients</span>
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Recipe or ingredient"
            enterKeyHint="search"
            autoComplete="off"
            onKeyDown={(e) => e.key === "Enter" && input.current?.blur()}
          />
          {q && (
            <button type="button" className="icon-btn" style={{ width: 32, height: 32, background: "transparent" }} aria-label="Clear" onClick={() => { setQ(""); input.current?.focus(); }}>
              <Icon name="x" size={18} />
            </button>
          )}
        </label>
      </div>
      <p className="search-count" aria-live="polite">
        {words.length
          ? results.length
            ? `${results.length} recipe${results.length === 1 ? "" : "s"} with “${q.trim()}”`
            : `No recipes with “${q.trim()}”`
          : `All ${recipes.length} recipes`}
      </p>
      <ul className="search-results">
        {results.map((r) => (
          <li key={r.id}>
            <Link href={`/recipes/${r.id}`} className="search-row" onClick={() => (document.body.style.overflow = "")}>
              <Photo src={r.photo_url ?? r.image_url} className="search-thumb" iconSize={24} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <b>{r.title}</b>
                <span className="recipe-meta" style={{ marginTop: 3 }}>
                  {r.total_minutes != null && <span>{duration(r.total_minutes)}</span>}
                  <FlagTags r={r} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {words.length > 0 && results.length === 0 && (
        <p className="muted" style={{ margin: "8px 20px" }}>Try one word, like an ingredient: “lentils”, “salmon”.</p>
      )}
    </div>
  );
}
