import { drive_v3, drive } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";

// ─────────────────────────────────────────────────────────────────────────────
// Auth: OAuth refresh token (current mode)
//
// Setup:
//   1. Google Cloud Console → OAuth consent screen → Internal (Zunesty WS)
//   2. Credentials → Create OAuth client ID → Web application
//        Authorized redirect URI: http://localhost:4567/oauth-callback
//   3. Mint the refresh token locally:
//        GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
//          node scripts/get-google-refresh-token.mjs
//   4. Paste GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
//      into .env.local + Vercel
//
// Full Drive access (read + write) under the user who granted consent.
//
// API-key fallback (for read-only public files) lives in the commented block
// at the bottom of this function — flip the two blocks if you need to switch.
// ─────────────────────────────────────────────────────────────────────────────

let cached: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (cached) return cached;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth env vars missing. Need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN. " +
        "Run `node scripts/get-google-refresh-token.mjs` to mint the refresh token."
    );
  }

  const auth = new OAuth2Client(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  cached = drive({ version: "v3", auth });
  return cached;

  // ─── API-key mode (legacy / read-only public-files fallback) ───────────────
  // const apiKey = process.env.GOOGLE_API_KEY;
  // if (!apiKey) throw new Error("GOOGLE_API_KEY not set");
  // cached = drive({ version: "v3", auth: apiKey });
  // return cached;
}

/** Normalize Drive API errors so 403/404 surface a clear, actionable message. */
function wrapDriveError(err: unknown, context: string): Error {
  const status =
    (err as { code?: number; status?: number; response?: { status?: number } })
      ?.code ??
    (err as { status?: number })?.status ??
    (err as { response?: { status?: number } })?.response?.status;

  if (status === 403 || status === 404) {
    return new Error(
      `${context} failed (HTTP ${status}). The OAuth user doesn't have access to this file/folder, or the file ID is wrong. Make sure the folder is shared with the account that consented to the OAuth flow.`
    );
  }
  if (status === 401) {
    return new Error(
      `${context} failed (HTTP 401). The OAuth token is invalid or expired. Re-mint the refresh token via scripts/get-google-refresh-token.mjs.`
    );
  }
  return err instanceof Error ? err : new Error(`${context} failed: ${String(err)}`);
}

export type DriveImage = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
};

/**
 * Find a subfolder by exact name inside a parent folder. Returns the
 * subfolder's Drive ID, or null if no folder with that name exists.
 * Drive folder names are case-sensitive on the API side.
 */
export async function findSubfolder(
  parentFolderId: string,
  name: string
): Promise<string | null> {
  const d = getDriveClient();
  try {
    // Escape single quotes in the name for the Drive query DSL
    const safeName = name.replace(/'/g, "\\'");
    const res = await d.files.list({
      q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}' and trashed = false`,
      fields: "files(id, name)",
      pageSize: 1,
    });
    const folder = res.data.files?.[0];
    return folder?.id || null;
  } catch (err) {
    throw wrapDriveError(err, `findSubfolder(${parentFolderId}, ${name})`);
  }
}

/** List image files inside a Drive folder. Folder must be public. */
export async function listImagesInFolder(folderId: string): Promise<DriveImage[]> {
  const d = getDriveClient();
  try {
    const res = await d.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "files(id, name, mimeType, webViewLink, webContentLink)",
      pageSize: 100,
    });
    return (res.data.files || []).map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      webViewLink: f.webViewLink || undefined,
      webContentLink: f.webContentLink || undefined,
    }));
  } catch (err) {
    throw wrapDriveError(err, `listImagesInFolder(${folderId})`);
  }
}

/** Download a Drive file as a Buffer. File must be public. */
export async function downloadImage(fileId: string): Promise<Buffer> {
  const d = getDriveClient();
  try {
    const res = await d.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data as ArrayBuffer);
  } catch (err) {
    throw wrapDriveError(err, `downloadImage(${fileId})`);
  }
}

/** Pick a random image from a folder. Returns null if folder is empty. */
export async function pickRandomImage(folderId: string): Promise<DriveImage | null> {
  const images = await listImagesInFolder(folderId);
  if (images.length === 0) return null;
  return images[Math.floor(Math.random() * images.length)];
}

/** Upload an image Buffer to a Drive folder. Returns the file ID + view URL. */
export async function uploadImage(
  folderId: string,
  filename: string,
  buffer: Buffer,
  mimeType = "image/png"
): Promise<{ id: string; webViewLink: string }> {
  const d = getDriveClient();
  try {
    const res = await d.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        mimeType,
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: "id, webViewLink",
    });
    return {
      id: res.data.id!,
      webViewLink: res.data.webViewLink!,
    };
  } catch (err) {
    throw wrapDriveError(err, `uploadImage(${filename})`);
  }
}

/** Create a new subfolder inside a parent folder. */
export async function createFolder(
  parentFolderId: string,
  name: string
): Promise<{ id: string; webViewLink: string }> {
  const d = getDriveClient();
  try {
    const res = await d.files.create({
      requestBody: {
        name,
        parents: [parentFolderId],
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id, webViewLink",
    });
    return {
      id: res.data.id!,
      webViewLink: res.data.webViewLink!,
    };
  } catch (err) {
    throw wrapDriveError(err, `createFolder(${name})`);
  }
}

/** Move a file from one Drive folder to another (used for the approve action). */
export async function moveFile(
  fileId: string,
  fromFolderId: string,
  toFolderId: string
): Promise<void> {
  const d = getDriveClient();
  try {
    await d.files.update({
      fileId,
      addParents: toFolderId,
      removeParents: fromFolderId,
      fields: "id, parents",
    });
  } catch (err) {
    throw wrapDriveError(err, `moveFile(${fileId})`);
  }
}
