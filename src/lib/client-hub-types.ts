// Client Hub types. Pure type defs only — safe to import from client components.

export const TASK_STATUSES = ["todo", "in_progress", "qc", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  qc: "Quality Control",
  completed: "Completed",
};

export const CLIENT_STAGES = ["onboarding", "icp_brief", "campaign_build", "live", "optimizing"] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];

export const STAGE_LABELS: Record<ClientStage, string> = {
  onboarding: "Onboarding",
  icp_brief: "ICP + Brief",
  campaign_build: "Campaign Build",
  live: "Live",
  optimizing: "Optimizing",
};

export type TaskSource =
  | "slack_command"
  | "slack_shortcut"
  | "dashboard"
  | "api"
  | "sweep"
  | "recurring"
  | "slack_mention";

export type ActivityAction = "created" | "status_change" | "revision" | "updated";

export type ProposalKind = "new_task" | "status_change";
export type ProposalStatus = "open" | "approved" | "dismissed";

export type Relationship = "Strong" | "Moderate" | "Weak";
export type ChurnRisk = "Low" | "Medium" | "High";
export type AccountType = "SMB" | "Mid-Market" | "Enterprise";
export type ArRisk = "Current" | "Past Due";

export type TeamMember = {
  id: number;
  name: string;
  slack_user_id: string | null;
  role: string | null;
};

export type Client = {
  id: number;
  name: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  active: boolean;
  sort_order: number;
  stage: ClientStage;
  stage_entered_at: string | null;
  owner_id: number | null;
  mrr: number | null;
  gross_profit: number | null;
  performance: string | null;
  start_date: string | null;
  opt_out_date: string | null;
  renewal_date: string | null;
  relationship: Relationship | null;
  delivery_results: Relationship | null;
  churn_risk: ChurnRisk | null;
  account_type: AccountType | null;
  ar_risk: ArRisk | null;
  contract_url: string | null;
  amendment_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: number;
  client_id: number | null;
  title: string;
  details: string | null;
  assignee_id: number | null;
  status: TaskStatus;
  due_date: string | null;
  source: TaskSource | null;
  slack_permalink: string | null;
  recurring_template_id: number | null;
  revision_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskWithNames = Task & {
  client_name: string | null;
  assignee_name: string | null;
};

export type RecurringTemplate = {
  id: number;
  client_id: number | null;
  title: string;
  details: string | null;
  assignee_id: number | null;
  due_rule: string;
  lead_time_days: number;
  active: boolean;
};

export type OnboardingItem = {
  id: number;
  client_id: number;
  title: string;
  done: boolean;
  sort_order: number;
};

export type ActivityLogEntry = {
  id: number;
  task_id: number;
  actor: string | null;
  action: ActivityAction;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  note: string | null;
  created_at: string;
};

export type Proposal = {
  id: number;
  kind: ProposalKind;
  payload: Record<string, unknown>;
  client_id: number | null;
  client_name?: string | null;
  status: ProposalStatus;
  slack_message_ts: string | null;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

export type BootstrapPayload = {
  clients: Client[];
  team: TeamMember[];
  recurring: RecurringTemplate[];
  tasks: TaskWithNames[];
  proposals: Proposal[];
  onboardingItems: OnboardingItem[];
};
