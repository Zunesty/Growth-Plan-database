import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type {
  AdBatch,
  AdConcept,
  ConceptStatus,
} from "@/lib/ad-generator-types";

// Update a single concept on a batch:
//   POST /api/ad-generator/concepts/update
//   { batchId, conceptId, status?, headline?, visualPrompt?, hook? }
//
// `status` lets the user approve/reject. Providing any of the text fields
// implies an edit — we set status to "edited" automatically unless an
// explicit status was passed in.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      batchId: string;
      conceptId: string;
      status?: ConceptStatus;
      headline?: string;
      visualPrompt?: string;
      hook?: string;
      rejectionReason?: string;
    };

    const {
      batchId,
      conceptId,
      status,
      headline,
      visualPrompt,
      hook,
      rejectionReason,
    } = body;
    if (!batchId || !conceptId) {
      return Response.json(
        { error: "Missing required fields: batchId, conceptId" },
        { status: 400 }
      );
    }

    const { data: batchRow, error: batchErr } = await supabase
      .from("ad_batches")
      .select("data")
      .eq("id", batchId)
      .single();

    if (batchErr || !batchRow) {
      return Response.json(
        { error: `Batch ${batchId} not found` },
        { status: 404 }
      );
    }

    const batch = batchRow.data as AdBatch;
    const concepts: AdConcept[] = batch.concepts || [];
    const idx = concepts.findIndex((c) => c.id === conceptId);
    if (idx === -1) {
      return Response.json(
        { error: `Concept ${conceptId} not found on batch ${batchId}` },
        { status: 404 }
      );
    }

    const current = concepts[idx];
    const hasEdits =
      (headline !== undefined && headline !== current.headline) ||
      (visualPrompt !== undefined && visualPrompt !== current.visualPrompt) ||
      (hook !== undefined && hook !== current.hook);

    const updated: AdConcept = {
      ...current,
      ...(headline !== undefined ? { headline } : {}),
      ...(visualPrompt !== undefined ? { visualPrompt } : {}),
      ...(hook !== undefined ? { hook } : {}),
      ...(status ? { status } : hasEdits ? { status: "edited" as const } : {}),
      ...(hasEdits ? { editedAt: new Date().toISOString() } : {}),
      ...(rejectionReason !== undefined ? { rejectionReason } : {}),
    };

    const newConcepts = [...concepts];
    newConcepts[idx] = updated;

    const updatedBatch: AdBatch = { ...batch, concepts: newConcepts };
    const { error: writeErr } = await supabase.from("ad_batches").upsert({
      id: batchId,
      data: updatedBatch,
      updated_at: new Date().toISOString(),
    });

    if (writeErr) {
      return Response.json({ error: writeErr.message }, { status: 500 });
    }

    return Response.json({ success: true, concept: updated });
  } catch (error) {
    console.error("Concept update error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update concept",
      },
      { status: 500 }
    );
  }
}
