"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { FORM_ID, RecipeForm } from "@/components/RecipeForm";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/client/api";
import { shrinkPhoto, uploadPhoto } from "@/lib/client/image";
import type { Draft, ImportResult } from "@/lib/client/types";

type Mode = "type" | "link" | "photo";

const EMPTY: Draft = {
  title: "", description: null, servings: null, prep_minutes: null, cook_minutes: null, total_minutes: null,
  ingredients: "", instructions: "", source_type: "manual", source_url: null, image_url: null, photo_path: null,
  baby_friendly: false, easy: false, freezes_well: false, tags: [], notes: null,
};

const MAX_PHOTOS = 3;

export default function AddRecipe() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [existing, setExisting] = useState<{ id: string; title: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  // Opened from Android's share sheet ("Share → Panda Chef"): read the link straight away.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const shared = p.get("url") || (p.get("text") ?? "").match(/https?:\/\/\S+/)?.[0];
    if (shared) {
      setMode("link");
      setUrl(shared);
      void importLink(shared);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showDraft(d: Draft) {
    setDraft(d);
    setDraftKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  }

  async function importLink(link = url) {
    const value = link.trim();
    if (!/^https?:\/\//i.test(value)) {
      setError("Paste a full web link, starting with https://");
      return;
    }
    setError(null);
    setWorking("Reading the recipe…");
    try {
      const res = await api<ImportResult>("/api/recipes/import-url", { method: "POST", json: { url: value } });
      setExisting(res.existing ?? null);
      showDraft(res.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
    }
  }

  async function importPhotos(files: FileList | null) {
    if (!files?.length) return;
    const picked = [...files].slice(0, MAX_PHOTOS);
    setError(null);
    setWorking(picked.length > 1 ? `Reading ${picked.length} pages… this takes about 20 seconds` : "Reading the photo… this takes about 20 seconds");
    try {
      const form = new FormData();
      for (const f of picked) form.append("photo", await shrinkPhoto(f), "page.jpg");
      const res = await api<ImportResult>("/api/recipes/import-photo", { method: "POST", body: form });
      setExisting(null);
      showDraft({ ...res.draft, photo_url: res.photo_url ?? null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(null);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }

  async function save(body: Record<string, unknown>, photo: Blob | null) {
    setSaving(true);
    try {
      const res = await api<{ id: string }>("/api/recipes", { method: "POST", json: body });
      if (photo) await uploadPhoto(res.id, photo).catch(() => {}); // the recipe is saved either way
      router.replace(`/recipes/${res.id}`);
    } catch (e) {
      setSaving(false);
      throw e;
    }
  }

  function pick(m: Mode) {
    setMode(m);
    setError(null);
    if (m === "type") showDraft(EMPTY);
    else setDraft(null);
  }

  // Checking a draft: the whole recipe on screen, Save in the thumb zone.
  if (draft) {
    return (
      <Screen
        title={mode === "type" && !draft.title ? "Type a recipe" : "Check and save"}
        subtitle={mode === "type" ? undefined : "Fix anything that came through wrong."}
        right={
          <button type="button" className="icon-btn" aria-label="Discard" onClick={() => (mode === "type" ? pick("link") : setDraft(null))}>
            <Icon name="x" />
          </button>
        }
        tabs={false}
        dockHeight={90}
        dock={
          <button type="submit" form={FORM_ID} className="btn btn-primary btn-block" disabled={saving}>
            <Icon name="check" /> {saving ? "Saving…" : "Save recipe"}
          </button>
        }
      >
        <main className="screen-body">
          {existing && (
            <div className="panel panel-warn">
              <Icon name="alert" />
              <div>
                <strong>You already have this one</strong>
                <Link href={`/recipes/${existing.id}`}>Open “{existing.title}”</Link> instead, or save a second copy.
              </div>
            </div>
          )}
          <RecipeForm key={draftKey} initial={draft} onSave={save} />
        </main>
      </Screen>
    );
  }

  return (
    <Screen
      title="Add a recipe"
      subtitle="From a link, a photo, or typed in."
      dockHeight={mode === "link" ? 300 : 250}
      dock={
        <>
          <div className="seg" role="group" aria-label="How to add">
            <button type="button" aria-pressed={mode === "type"} onClick={() => pick("type")}>
              <Icon name="pencil" size={18} /> Type
            </button>
            <button type="button" aria-pressed={mode === "link"} onClick={() => pick("link")}>
              <Icon name="link" size={18} /> Link
            </button>
            <button type="button" aria-pressed={mode === "photo"} onClick={() => pick("photo")}>
              <Icon name="camera" size={18} /> Photo
            </button>
          </div>
          {mode === "link" && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void importLink();
              }}
            >
              <label className="sr-only" htmlFor="url">Recipe link</label>
              <input id="url" className="input" style={{ borderRadius: 999 }} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a recipe link" autoComplete="off" />
              <button type="submit" className="btn btn-primary btn-block" disabled={!!working || !url.trim()}>
                <Icon name="link" /> Get recipe
              </button>
            </form>
          )}
          {mode === "photo" && (
            <div className="row">
              <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => importPhotos(e.target.files)} />
              <input ref={library} type="file" accept="image/*" multiple hidden onChange={(e) => importPhotos(e.target.files)} />
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={!!working} onClick={() => camera.current?.click()}>
                <Icon name="camera" /> Take photo
              </button>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={!!working} onClick={() => library.current?.click()}>
                <Icon name="image" /> Choose
              </button>
            </div>
          )}
        </>
      }
    >
      <main className="screen-body">
        {working ? (
          <div className="card">
            <Spinner label={working} />
          </div>
        ) : mode === "link" ? (
          <div className="card stack">
            <h2>Paste a link</h2>
            <p style={{ margin: 0 }}>Copy the address of any recipe page (BBC Good Food, a blog, anything) and paste it below.</p>
            <p className="small muted" style={{ margin: 0 }}>
              On the Pixel you can also share a page straight to Panda Chef from Chrome&apos;s Share menu.
            </p>
          </div>
        ) : (
          <div className="card stack">
            <h2>Photograph the recipe</h2>
            <p style={{ margin: 0 }}>A cookbook page, a handwritten card or a screenshot. Pick up to {MAX_PHOTOS} photos if it runs over several pages.</p>
            <p className="small muted" style={{ margin: 0 }}>You check everything before it&apos;s saved. The first photo becomes the recipe&apos;s picture; you can change it later.</p>
          </div>
        )}
        {error && (
          <div className="panel panel-avoid" role="alert">
            <Icon name="alert" />
            <div>
              <strong>That didn&apos;t work</strong>
              {error}
            </div>
          </div>
        )}
      </main>
    </Screen>
  );
}
