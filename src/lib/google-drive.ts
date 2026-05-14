import { drive_v3, drive } from "@googleapis/drive";
import { JWT } from "google-auth-library";
import { Readable } from "stream";

let cached: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (cached) return cached;

  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON not set. Add the service account JSON to .env.local."
    );
  }

  const credentials = JSON.parse(credentialsJson);
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  cached = drive({ version: "v3", auth });
  return cached;
}

export type DriveImage = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
};

/** List image files inside a Drive folder. */
export async function listImagesInFolder(folderId: string): Promise<DriveImage[]> {
  const d = getDriveClient();
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
}

/** Download a Drive file as a Buffer. */
export async function downloadImage(fileId: string): Promise<Buffer> {
  const d = getDriveClient();
  const res = await d.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
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
}

/** Move a file from one Drive folder to another (used for the approve action). */
export async function moveFile(
  fileId: string,
  fromFolderId: string,
  toFolderId: string
): Promise<void> {
  const d = getDriveClient();
  await d.files.update({
    fileId,
    addParents: toFolderId,
    removeParents: fromFolderId,
    fields: "id, parents",
  });
}
