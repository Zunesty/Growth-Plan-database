import { supabase } from "./supabase";
import { HttpError } from "./client-hub-http";
import type { OnboardingItem } from "./client-hub-types";

const ITEMS = "client_hub_onboarding_items";

export async function listOnboardingItems(): Promise<OnboardingItem[]> {
  const { data, error } = await supabase.from(ITEMS).select("*").order("client_id").order("sort_order");
  if (error) {
    console.error("[client-hub] listOnboardingItems error:", error.message);
    return [];
  }
  return (data || []) as OnboardingItem[];
}

export async function createOnboardingItem(clientId: number, title: string): Promise<OnboardingItem> {
  const { data, error } = await supabase
    .from(ITEMS)
    .insert({ client_id: clientId, title })
    .select()
    .single();
  if (error || !data) throw new HttpError(500, `Failed to create checklist item: ${error?.message}`);
  return data as OnboardingItem;
}

export async function updateOnboardingItem(
  id: number,
  fields: { title?: string; done?: boolean; sort_order?: number }
): Promise<OnboardingItem> {
  const patch: Record<string, unknown> = {};
  if ("title" in fields) patch.title = fields.title;
  if ("done" in fields) patch.done = fields.done;
  if ("sort_order" in fields) patch.sort_order = fields.sort_order;

  const { data, error } = await supabase.from(ITEMS).update(patch).eq("id", id).select().maybeSingle();
  if (error) throw new HttpError(500, `Failed to update checklist item: ${error.message}`);
  if (!data) throw new HttpError(404, "Checklist item not found.");
  return data as OnboardingItem;
}

export async function deleteOnboardingItem(id: number): Promise<void> {
  const { error } = await supabase.from(ITEMS).delete().eq("id", id);
  if (error) throw new HttpError(500, `Failed to delete checklist item: ${error.message}`);
}
