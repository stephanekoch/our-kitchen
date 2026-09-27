"use client";

import { useMemo, useState, type FormEvent } from "react";
import { babyCheck } from "@/lib/baby-check";
import { normalizeIngredients } from "@/lib/ingredients";
import { useKnown } from "@/lib/client/known";
import type { Draft } from "@/lib/client/types";
import { BabyPanel, Photo } from "./bits";
import { IngredientEditor } from "./IngredientEditor";
import { TagEditor } from "./TagEditor";

export const FORM_ID = "recipe-form";

type FormState = {
  title: string;
  servings: string;
  total: string;
  ingredients: string;
  method: string;
  notes: string;
  baby_friendly: boolean;
  easy: boolean;
  freezes_well: boolean;
  tags: string[];
};

function toState(d: Draft): FormState {
  return {
    title: d.title ?? "",
    servings: d.servings != null ? String(d.servings) : "",
    total: d.total_minutes != null ? String(d.total_minutes) : "",
    ingredients: Array.isArray(d.ingredients) ? d.ingredients.map((i) => i.raw).join("\n") : (d.ingredients ?? ""),
    method: Array.isArray(d.instructions) ? d.instructions.join("\n") : (d.instructions ?? ""),
    notes: d.notes ?? "",
    baby_friendly: d.baby_friendly,
    easy: d.easy,
    freezes_well: d.freezes_well,
    tags: d.tags ?? [],
  };
}

const toInt = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The whole recipe on one screen, ready to check and save. The Save button lives in the page's dock. */
export function RecipeForm({
  initial,
  onSave,
}: {
  initial: Draft;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [s, setS] = useState<FormState>(() => toState(initial));
  const [error, setError] = useState<string | null>(null);
  const known = useKnown();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const warnings = useMemo(() => {
    try {
      return babyCheck(normalizeIngredients(s.ingredients));
    } catch {
      return [];
    }
  }, [s.ingredients]);
  const hasAvoid = warnings.some((w) => w.level === "avoid");
  const total = toInt(s.total);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!s.title.trim()) {
      setError("Give the recipe a name");
      return;
    }
    setError(null);
    const servings = toInt(s.servings);
    try {
      await onSave({
        title: s.title.trim(),
        description: initial.description,
        servings: servings && servings > 0 && servings <= 50 ? servings : null,
        // A total typed here wins; otherwise keep the prep/cook split that came with the recipe.
        total_minutes: total,
        prep_minutes: total === initial.total_minutes ? initial.prep_minutes : null,
        cook_minutes: total === initial.total_minutes ? initial.cook_minutes : null,
        ingredients: s.ingredients,
        instructions: s.method,
        source_type: initial.source_type,
        source_url: initial.source_url,
        image_url: initial.image_url,
        photo_path: initial.photo_path,
        baby_friendly: s.baby_friendly,
        easy: s.easy,
        freezes_well: s.freezes_well,
        tags: s.tags,
        notes: s.notes.trim() || null,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const photo = initial.photo_url ?? initial.image_url;

  return (
    <form id={FORM_ID} onSubmit={submit} className="stack" noValidate>
      {photo && <Photo src={photo} className="hero" iconSize={60} />}

      <div className="card stack">
        <label className="field">
          Name
          <input className="input" value={s.title} onChange={(e) => set("title", e.target.value)} placeholder="Fish pie" required />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            Serves
            <input className="input" inputMode="numeric" value={s.servings} onChange={(e) => set("servings", e.target.value.replace(/\D/g, ""))} placeholder="4" />
          </label>
          <label className="field" style={{ flex: 1 }}>
            Total time (min)
            <input className="input" inputMode="numeric" value={s.total} onChange={(e) => set("total", e.target.value.replace(/\D/g, ""))} placeholder="45" />
          </label>
        </div>
      </div>

      <div className="card stack">
        <div className="field" role="group" aria-label="Flags">
          Flags
          <div className="chips wrap" style={{ flexWrap: "wrap" }}>
            <button type="button" className="chip" aria-pressed={s.baby_friendly} onClick={() => set("baby_friendly", !s.baby_friendly)}>
              Baby-friendly
            </button>
            <button type="button" className="chip" aria-pressed={s.easy} onClick={() => set("easy", !s.easy)}>
              Easy
            </button>
            <button type="button" className="chip" aria-pressed={s.freezes_well} onClick={() => set("freezes_well", !s.freezes_well)}>
              Freezes well
            </button>
          </div>
          <span className="hint">{total !== null && total <= 30 ? "Tagged Quick automatically (30 min or less)." : "Quick is added automatically for 30 minutes or less."}</span>
        </div>
        {warnings.length > 0 && <BabyPanel warnings={warnings} babyFriendly={s.baby_friendly} />}
        {s.baby_friendly && hasAvoid && (
          <p className="hint" style={{ margin: 0 }}>
            Tagged baby-friendly: fine if you leave those out of the baby&apos;s portion.
          </p>
        )}
      </div>

      <div className="card stack">
        <div className="field">
          Tags <span className="hint">Your own labels, e.g. weeknight, batch cook, Sunday lunch</span>
          <TagEditor value={s.tags} onChange={(t) => set("tags", t)} known={known.tags} />
        </div>
      </div>

      <div className="card stack">
        <div className="field">
          Ingredients <span className="hint">Tap one to change it. Suggestions come from ingredients you&apos;ve used before.</span>
          <IngredientEditor value={s.ingredients} onChange={(v) => set("ingredients", v)} known={known.ingredients} />
        </div>
      </div>

      <div className="card stack">
        <label className="field">
          Method <span className="hint">One step per line</span>
          <textarea className="textarea" rows={Math.max(5, s.method.split("\n").length + 1)} value={s.method} onChange={(e) => set("method", e.target.value)} placeholder={"Rinse the lentils.\nSoften the onion and carrot…"} />
        </label>
        <label className="field">
          Notes <span className="hint">Your tweaks, e.g. “we double the garlic”</span>
          <textarea className="textarea" rows={2} value={s.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>

      {initial.source_url && (
        <p className="small muted" style={{ margin: "0 4px", overflowWrap: "anywhere" }}>
          From {new URL(initial.source_url).hostname.replace(/^www\./, "")}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
