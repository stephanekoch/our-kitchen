import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type PgError = { code?: string; message: string; details?: string | null; hint?: string | null };

/** Map a PostgREST/Postgres error to an HttpError. */
export function dbError(error: PgError): HttpError {
  switch (error.code) {
    case "P0002":
    case "PGRST116": // .single() found no row
      return new HttpError(404, "Not found");
    case "23505":
      return new HttpError(409, "Already exists");
    case "42501":
      return new HttpError(403, "Not allowed");
    case "22023":
    case "23514":
    case "22P02":
      return new HttpError(400, error.message);
    default:
      console.error("database error", error);
      return new HttpError(500, "Database error");
  }
}

/** Wrap a route handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid input", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          { status: 400 },
        );
      }
      if (err instanceof Anthropic.APIError) {
        const busy = err.status === 429 || err.status === 529;
        console.error("anthropic error", err.status, err.message);
        return NextResponse.json(
          { error: busy ? "The recipe reader is busy — try again in a minute" : "The recipe reader failed" },
          { status: busy ? 503 : 502 },
        );
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
