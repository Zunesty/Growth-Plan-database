import type { NextRequest } from "next/server";
import {
  findSubfolder,
  listImagesInFolder,
  type DriveImage,
} from "@/lib/google-drive";
import { PRODUCTS } from "@/lib/ad-generator-types";

// Lists the bottle reference images available for a given product (or all
// active products if product=all). Used by the new-batch modal to render
// a thumbnail preview before the user clicks Generate.
//
// GET /api/ad-generator/bottles?product=dopamine-brain-food
// GET /api/ad-generator/bottles?product=all
//
// Response shape: { images: [{ id, name, product }], byProduct: { ... } }

const BOTTLES_FOLDER_ID = process.env.DRIVE_BOTTLES_FOLDER_ID;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const productParam = url.searchParams.get("product") || "all";

  if (!BOTTLES_FOLDER_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    return Response.json({
      images: [],
      byProduct: {},
      error: "Drive not configured (set DRIVE_BOTTLES_FOLDER_ID + GOOGLE_REFRESH_TOKEN)",
    });
  }

  const targets =
    productParam === "all"
      ? PRODUCTS.filter((p) => p.active)
      : PRODUCTS.filter((p) => p.id === productParam);

  if (targets.length === 0) {
    return Response.json(
      { error: `Unknown product: ${productParam}` },
      { status: 400 }
    );
  }

  const byProduct: Record<string, { productName: string; images: DriveImage[] }> = {};
  const flat: Array<DriveImage & { product: string }> = [];

  for (const p of targets) {
    try {
      const subId = await findSubfolder(BOTTLES_FOLDER_ID, p.bottleFolderName);
      const images = subId ? await listImagesInFolder(subId) : [];
      byProduct[p.id] = { productName: p.name, images };
      for (const img of images) {
        flat.push({ ...img, product: p.id });
      }
    } catch (err) {
      console.warn(`Failed to list bottles for ${p.id}:`, err);
      byProduct[p.id] = { productName: p.name, images: [] };
    }
  }

  return Response.json({ images: flat, byProduct });
}
