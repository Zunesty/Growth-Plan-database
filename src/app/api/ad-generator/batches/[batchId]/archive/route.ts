// Archive / unarchive a batch.
//
// POST /api/ad-generator/batches/<batchId>/archive
//   { archived: true }   → sets archivedAt = now
//   { archived: false }  → clears archivedAt
//
// Archive is reversible — the batch row, its concepts, and its creatives all
// stay in Supabase. Only the dashboard's default view hides archived ones.

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { AdBatch } from "@/lib/ad-generator-types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const { archived } = (await req.json()) as { archived: boolean };

    const { data: batchRow, error: fetchErr } = await supabase
      .from("ad_batches")
      .select("data")
      .eq("id", batchId)
      .single();

    if (fetchErr || !batchRow) {
      return Response.json(
        { error: `Batch ${batchId} not found` },
        { status: 404 }
      );
    }

    const batch = batchRow.data as AdBatch;
    const updated: AdBatch = {
      ...batch,
      archivedAt: archived ? new Date().toISOString() : undefined,
    };
    // When un-archiving we want the field GONE from the JSONB rather than set
    // to undefined (which serializes weirdly). Explicit delete:
    if (!archived) delete updated.archivedAt;

    const { error: writeErr } = await supabase.from("ad_batches").upsert({
      id: batchId,
      data: updated,
      updated_at: new Date().toISOString(),
    });

    if (writeErr) {
      return Response.json({ error: writeErr.message }, { status: 500 });
    }

    return Response.json({ success: true, archived });
  } catch (error) {
    console.error("Archive batch error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to archive batch",
      },
      { status: 500 }
    );
  }
}
