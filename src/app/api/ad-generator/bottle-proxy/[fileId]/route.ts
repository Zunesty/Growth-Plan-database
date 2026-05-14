import type { NextRequest } from "next/server";
import { downloadImage } from "@/lib/google-drive";

// Serves a Drive bottle-shot image through a public URL so that
// KIE AI (or any external image-to-image model) can fetch it.
// The Drive folder itself does NOT need to be public — auth happens here
// via the service account, then the binary is streamed back unauthenticated.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return new Response("Invalid file ID", { status: 400 });
  }

  try {
    const buffer = await downloadImage(fileId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Bottle proxy error:", err);
    return new Response("Image not available", { status: 404 });
  }
}
