// Shared client-side fetch helper for Client Hub components. Pulled out of
// page.tsx into its own file since Next.js's App Router restricts what a
// page.tsx file may export (only the default component + a small reserved
// set like `metadata`) — components importing a plain helper from a page
// module works in dev but risks a production build error.

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) throw new Error((data.error as string) || `Request failed (${res.status})`);
  return data as T;
}
