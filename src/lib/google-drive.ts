import { drive_v3, drive } from "@googleapis/drive";
import { Readable } from "stream";

// ─────────────────────────────────────────────────────────────────────────────
// Auth: API key (current mode)
//
// Setup:
//   1. Google Cloud Console → APIs & Services → Credentials → Create API key
//   2. Restrict the key to "Google Drive API" (Application restrictions optional)
//   3. Paste into GOOGLE_API_KEY in .env.local + Vercel
//
// Limitations of API key auth:
//   - Works ONLY for files/folders set to "Anyone with the link can view"
//   - READ-ONLY. Uploads (files.create) and moves (files.update with parents)
//     will fail with 401/403 — those need OAuth or a service account.
//   - Anything not public will return 404 (Drive masks 403 as 404 by design).
//
// To re-enable OAuth (refresh-token flow) for private/write access, restore
// the commented block below and set the GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
// / GOOGLE_REFRESH_TOKEN env vars. The helper to mint the refresh token still
// lives at scripts/get-google-refresh-token.mjs.
// ─────────────────────────────────────────────────────────────────────────────

// import { OAuth2Client } from "google-auth-library";

let cached: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY not set. Create an API key in Google Cloud Console, restrict it to the Drive API, then add it to .env.local + Vercel."
    );
  }

  cached = drive({ version: "v3", auth: apiKey });
  return cached;

  // ─── OAuth refresh-token mode (legacy / for future private+write access) ───
  // const clientId = process.env.GOOGLE_CLIENT_ID;
  // const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  // if (!clientId || !clientSecret || !refreshToken) {
  //   throw new Error(
  //     "Google OAuth env vars missing. Need GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN. " +
  //       "Run `node scripts/get-google-refresh-token.mjs` to mint the refresh token."
  //   );
  // }
  // const auth = new OAuth2Client(clientId, clientSecret);
  // auth.setCredentials({ refresh_token: refreshToken });
  // cached = drive({ version: "v3", auth });
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
      `${context} failed (HTTP ${status}). With API key auth, the file/folder must be shared as "Anyone with the link can view" — otherwise Drive returns 404 even if it exists. Check the share settings in Google Drive.`
    );
  }
  if (status === 401) {
    return new Error(
      `${context} failed (HTTP 401). The GOOGLE_API_KEY is invalid, expired, or not allowed to call the Drive API. Verify the key in Google Cloud Console.`
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

/**
 * Upload an image Buffer to a Drive folder.
 * NOTE: API key auth cannot write to Drive — this will fail with 401/403 in
 * API-key mode. Re-enable OAuth (see top of file) when uploads are needed.
 */
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
    throw wrapDriveError(
      err,
      `uploadImage(${filename}) — Drive writes require OAuth, not API key`
    );
  }
}

/**
 * Move a file from one folder to another (used by the approve action).
 * NOTE: same write limitation as uploadImage — will fail under API key auth.
 */
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
    throw wrapDriveError(
      err,
      `moveFile(${fileId}) — Drive writes require OAuth, not API key`
    );
  }
}
