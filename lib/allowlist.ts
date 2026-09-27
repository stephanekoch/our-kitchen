import { HttpError } from "./http";

/** Only the emails in ALLOWED_EMAILS can use the app (and spend Claude credits). */
export function allowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = allowedEmails();
  if (list.size === 0) throw new HttpError(500, "ALLOWED_EMAILS is not set");
  return list.has(email.trim().toLowerCase());
}
