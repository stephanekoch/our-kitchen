"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { FORM_ID, RecipeForm } from "@/components/RecipeForm";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/client/api";
import { writeCache } from "@/lib/client/cache";
import { uploadPhoto } from "@/lib/client/image";
import type { Draft, Recipe } from "@/lib/client/types";

export default function EditRecipe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ recipe: Recipe }>(`/api/recipes/${id}`)
      .then((d) => setRecipe(d.recipe))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  async function save(body: Record<string, unknown>, photo: Blob | null) {
    setSaving(true);
    try {
      await api(`/api/recipes/${id}`, { method: "PATCH", json: body });
      if (photo) await uploadPhoto(id, photo);
      writeCache(`recipe:${id}`, null);
      router.replace(`/recipes/${id}`);
    } catch (e) {
      setSaving(false);
      throw e;
    }
  }

  return (
    <Screen
      title="Edit recipe"
      right={
        <Link href={`/recipes/${id}`} className="icon-btn" aria-label="Cancel">
          <Icon name="x" />
        </Link>
      }
      tabs={false}
      dockHeight={90}
      dock={
        <button type="submit" form={FORM_ID} className="btn btn-primary btn-block" disabled={!recipe || saving}>
          <Icon name="check" /> {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      <main className="screen-body">
        {!recipe && (error ? <p className="error">{error}</p> : <Spinner label="Loading…" />)}
        {recipe && <RecipeForm initial={{ ...(recipe as unknown as Draft), ingredients: recipe.ingredients }} onSave={save} />}
      </main>
    </Screen>
  );
}
