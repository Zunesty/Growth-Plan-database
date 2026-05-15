"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { AdBatch, AdCreative, CreativeStatus } from "./ad-generator-types";

const BATCH_TABLE = "ad_batches";
const CREATIVE_TABLE = "ad_creatives";

async function fetchBatches(): Promise<AdBatch[]> {
  const { data, error } = await supabase
    .from(BATCH_TABLE)
    .select("data")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Supabase fetch batches error:", error);
    return [];
  }
  return (data || []).map((r) => r.data as AdBatch);
}

async function fetchCreatives(batchId: string): Promise<AdCreative[]> {
  const { data, error } = await supabase
    .from(CREATIVE_TABLE)
    .select("data")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Supabase fetch creatives error:", error);
    return [];
  }
  return (data || []).map((r) => r.data as AdCreative);
}

async function upsertBatch(batch: AdBatch) {
  const { error } = await supabase
    .from(BATCH_TABLE)
    .upsert({ id: batch.id, data: batch, updated_at: new Date().toISOString() });
  if (error) console.error("Supabase upsert batch error:", error);
}

async function upsertCreative(creative: AdCreative) {
  const { error } = await supabase.from(CREATIVE_TABLE).upsert({
    id: creative.id,
    batch_id: creative.batchId,
    data: creative,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("Supabase upsert creative error:", error);
}

// Poll every 5s while a dashboard/detail view is open so in-flight generations
// surface their progress without the user having to reload.
const POLL_INTERVAL_MS = 5000;

export function useBatches() {
  const [batches, setBatches] = useState<AdBatch[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchBatches();
    setBatches(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBatches().then((data) => {
      if (!cancelled) {
        setBatches(data);
        setHydrated(true);
      }
    });
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
    };
  }, [refresh]);

  return { batches, hydrated, refresh };
}

export function useBatchDetail(batchId: string) {
  const [batch, setBatch] = useState<AdBatch | null>(null);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    const [batches, creativeList] = await Promise.all([fetchBatches(), fetchCreatives(batchId)]);
    setBatch(batches.find((b) => b.id === batchId) || null);
    setCreatives(creativeList);
  }, [batchId]);

  useEffect(() => {
    let cancelled = false;
    refresh().then(() => {
      if (!cancelled) setHydrated(true);
    });
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
    };
  }, [refresh]);

  const updateCreativeStatus = useCallback(
    async (creativeId: string, status: CreativeStatus, rejectionReason?: string) => {
      const target = creatives.find((c) => c.id === creativeId);
      if (!target) return;
      const updated: AdCreative = {
        ...target,
        status,
        rejectionReason,
        reviewedAt: new Date().toISOString(),
      };
      setCreatives((prev) => prev.map((c) => (c.id === creativeId ? updated : c)));
      await upsertCreative(updated);
    },
    [creatives]
  );

  return { batch, creatives, hydrated, refresh, updateCreativeStatus };
}

export async function createBatch(batch: AdBatch) {
  await upsertBatch(batch);
}
