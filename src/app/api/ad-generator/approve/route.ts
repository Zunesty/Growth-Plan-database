import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { moveFile } from "@/lib/google-drive";
import type { AdBatch, AdCreative } from "@/lib/ad-generator-types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const OUTPUT_FOLDER_ID = process.env.DRIVE_OUTPUT_FOLDER_ID;
const APPROVED_FOLDER_ID = process.env.DRIVE_APPROVED_FOLDER_ID;

/**
 * Approve a creative. Moves the Drive file from the per-batch output
 * subfolder (or the root output folder for legacy batches) into the
 * Approved folder so Jimmy can grab them to upload to Meta.
 */
export async function POST(req: NextRequest) {
  try {
    const { creativeId, reviewedBy } = (await req.json()) as {
      creativeId: string;
      reviewedBy?: string;
    };

    // Fetch the creative
    const { data, error } = await supabase
      .from("ad_creatives")
      .select("data")
      .eq("id", creativeId)
      .single();

    if (error || !data) {
      return Response.json({ error: "Creative not found" }, { status: 404 });
    }

    const creative = data.data as AdCreative;

    // Resolve which folder the file currently lives in. Newer batches put
    // each run in its own dated subfolder under DRIVE_OUTPUT_FOLDER_ID;
    // legacy batches dumped everything in the root.
    let fromFolderId: string | null = OUTPUT_FOLDER_ID || null;
    if (creative.batchId) {
      const { data: batchRow } = await supabase
        .from("ad_batches")
        .select("data")
        .eq("id", creative.batchId)
        .single();
      const batch = batchRow?.data as AdBatch | undefined;
      if (batch?.outputFolderId) fromFolderId = batch.outputFolderId;
    }

    // Move the file in Drive (if everything's configured + we have a file ID)
    if (creative.driveFileId && fromFolderId && APPROVED_FOLDER_ID) {
      try {
        await moveFile(creative.driveFileId, fromFolderId, APPROVED_FOLDER_ID);
      } catch (driveErr) {
        console.error("Drive move failed:", driveErr);
        // Continue anyway — the Supabase status update is what matters most
      }
    }

    // Update Supabase
    const updated: AdCreative = {
      ...creative,
      status: "approved",
      reviewedBy: reviewedBy || "Unknown",
      reviewedAt: new Date().toISOString(),
    };

    await supabase.from("ad_creatives").upsert({
      id: creative.id,
      batch_id: creative.batchId,
      data: updated,
      updated_at: new Date().toISOString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Approve error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to approve" },
      { status: 500 }
    );
  }
}
