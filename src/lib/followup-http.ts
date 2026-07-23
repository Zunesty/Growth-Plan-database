// Shared error -> HTTP response mapping for the Follow-Up Agent API routes,
// mirroring the source app's `ah()` wrapper (lib functions throw an Error
// with an optional `.status`; routes map that to a JSON error response).

export function apiError(e: unknown): { status: number; body: { error: string } } {
  const err = e as Error & { status?: number };
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error("[follow-up-agent]", err.message || err);
  return { status, body: { error: err.message || "Something went wrong." } };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
