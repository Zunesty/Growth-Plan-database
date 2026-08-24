import { supabase } from "./supabase";
import { HttpError } from "./client-hub-http";
import { CLIENT_STAGES } from "./client-hub-types";
import type { Client, ClientStage } from "./client-hub-types";

const CLIENTS = "client_hub_clients";

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase.from(CLIENTS).select("*").order("sort_order").order("name");
  if (error) {
    console.error("[client-hub] listClients error:", error.message);
    return [];
  }
  return (data || []) as Client[];
}

export async function createClient(input: {
  name: string;
  slack_channel_id?: string | null;
  slack_channel_name?: string | null;
  owner_id?: number | null;
  stage?: ClientStage;
}): Promise<Client> {
  const stage: ClientStage = input.stage && CLIENT_STAGES.includes(input.stage) ? input.stage : "onboarding";
  const { data, error } = await supabase
    .from(CLIENTS)
    .insert({
      name: input.name,
      slack_channel_id: input.slack_channel_id ?? null,
      slack_channel_name: input.slack_channel_name ?? null,
      owner_id: input.owner_id ?? null,
      stage,
      stage_entered_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error || !data) throw new HttpError(500, `Failed to create client: ${error?.message}`);
  return data as Client;
}

const UPDATABLE_CLIENT_FIELDS = [
  "name",
  "slack_channel_id",
  "slack_channel_name",
  "active",
  "sort_order",
  "owner_id",
  "mrr",
  "gross_profit",
  "performance",
  "start_date",
  "opt_out_date",
  "renewal_date",
  "relationship",
  "delivery_results",
  "churn_risk",
  "account_type",
  "ar_risk",
  "contract_url",
  "amendment_url",
] as const;

export async function updateClient(
  id: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: Record<string, any>
): Promise<Client> {
  const patch: Record<string, unknown> = {};
  for (const key of UPDATABLE_CLIENT_FIELDS) {
    if (key in fields) {
      const value = fields[key];
      patch[key] = value === "" ? null : value;
    }
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from(CLIENTS).update(patch).eq("id", id).select().maybeSingle();
  if (error) throw new HttpError(500, `Failed to update client: ${error.message}`);
  if (!data) throw new HttpError(404, "Client not found.");
  return data as Client;
}

export async function setClientStage(id: number, stage: ClientStage): Promise<Client> {
  if (!CLIENT_STAGES.includes(stage)) throw new HttpError(400, "Unknown stage.");
  const { data, error } = await supabase
    .from(CLIENTS)
    .update({ stage, stage_entered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new HttpError(500, `Failed to move stage: ${error.message}`);
  if (!data) throw new HttpError(404, "Client not found.");
  return data as Client;
}
