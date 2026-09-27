"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { shrinkPhoto } from "@/lib/client/image";
import { useKnown } from "@/lib/client/known";
import type { Draft } from "@/lib/client/types";
import { Icon } from "./Icon";
import { IngredientEditor } from "./IngredientEditor";
import { Photo } from "./bits";
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
  quick: boolean;
  freezes_well: boolean;
  tags: string[];
};

function toState(d: Draft & { quick?: boolean }): FormState {
  return {
    title: d.title ?? "",
    servings: d.servings != null ? String(d.servings) : "",
    total: d.total_minutes != null ? String(d.total_minutes) : "",
    ingredients: Array.isArray(d.ingredients) ? d.ingredients.map((i) => i.raw).join("\n") : (d.ingredients ?? ""),
    method: Array.isArray(d.instructions) ? d.instructions.join("\n") : (d.instructions ?? ""),
    notes: d.notes ?? "",
    baby_friendly: d.baby_friendly,
    easy: d.easy,
    quick: d.quick ?? false,
    freezes_well: d.freezes_well,
    tags: d.tags ?? [],
  };
}

const toInt = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const FLAGS = [
  { key: "baby_friendly", label: "Baby-friendly" },
  { key: "easy", label: "Easy" },
  { key: "quick", label: "Quick" },
  { key: "freezes_well", label: "Freezes well" },
] as const;

/**
 * The whole recipe on one screen, ready to check and save. The Save button lives in the
 * page's dock; a new photo is uploaded by the page after the recipe itself is saved.
 */
export function RecipeForm({
  initial,
  onSave,
}: {
  initial: Draft & { quick?: boolean };
  onSave: (body: Record<string, unknown>, photo: Blob | null) => Promise<void>;
}) {
  const [s, setS] = useState<FormState>(() => toState(initial));
  const [error, setError] = useState<string | null>(null);
  const [servingsMissing, setServingsMissing] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const servingsInput = useRef<HTMLInputElement>(null);
  const known = useKnown();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const total = toInt(s.total);
  const unknownServings = initial.source_type !== "manual" && initial.servings == null;

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const blob = await shrinkPhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!s.title.trim()) {
      setError("Give the recipe a name");
      return;
    }
    const servings = toInt(s.servings);
    if (!servings || servings > 50) {
      setServingsMissing(true);
      setError("How many people does this recipe feed?");
      servingsInput.current?.focus();
      servingsInput.current?.scrollIntoView({ block: "center" });
      return;
    }
    setError(null);
    try {
      await onSave(
        {
          title: s.title.trim(),
          description: initial.description,
          servings,
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
          quick: s.quick,
          freezes_well: s.freezes_well,
          tags: s.tags,
          notes: s.notes.trim() || null,
        },
        photo?.blob ?? null,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const shownPhoto = photo?.url ?? initial.photo_url ?? initial.image_url;

  return (
    <form id={FORM_ID} onSubmit={submit} className="stack" noValidate>
      <div style={{ position: "relative" }}>
        <Photo src={shownPhoto} className="hero form-hero" iconSize={56} />
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        <button type="button" className="btn change-photo" onClick={() => fileInput.current?.click()} disabled={photoBusy}>
          <Icon name="camera" size={18} /> {photoBusy ? "Preparing…" : shownPhoto ? "Change photo" : "Add photo"}
        </button>
      </div>

      <div className="card stack">
        <label className="field">
          Name
          <input className="input" value={s.title} onChange={(e) => set("title", e.target.value)} placeholder="Fish pie" required />
        </label>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            Serves
            <input
              ref={servingsInput}
              className={`input${servingsMissing || (unknownServings && !s.servings) ? " input-attention" : ""}`}
              inputMode="numeric"
              value={s.servings}
              onChange={(e) => {
                set("servings", e.target.value.replace(/\D/g, ""));
                setServingsMissing(false);
              }}
              placeholder="How many?"
              required
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            Total time (min)
            <input className="input" inputMode="numeric" value={s.total} onChange={(e) => set("total", e.target.value.replace(/\D/g, ""))} placeholder="45" />
          </label>
        </div>
        {unknownServings && !s.servings && (
          <p className="hint" style={{ margin: 0, color: "var(--warn-fg)", fontWeight: 700 }}>
            The recipe doesn&apos;t say how many it serves. How many people does it feed?
          </p>
        )}
      </div>

      <div className="card stack">
        <div className="field" role="group" aria-label="Flags">
          Flags
          <div className="row wrap" style={{ gap: 8 }}>
            {FLAGS.map((f) => (
              <button key={f.key} type="button" className="chip" aria-pressed={s[f.key]} onClick={() => set(f.key, !s[f.key])}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
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
          Method <span className="hint">One step per line. Each line becomes a step to tick off when cooking.</span>
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
