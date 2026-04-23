export type TeamMember = "Silvia" | "Krithika" | "Santiago" | "Alejandra" | "Austin" | "Client";

export type Stage = "onboarding" | "icp-brief" | "campaign-build" | "live" | "optimizing";

export const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "onboarding", label: "Onboarding", color: "#7bbd53" },
  { id: "icp-brief", label: "ICP + Brief", color: "#29804b" },
  { id: "campaign-build", label: "Campaign Build", color: "#294e27" },
  { id: "live", label: "Live", color: "#7bbd53" },
  { id: "optimizing", label: "Optimizing", color: "#29804b" },
];

export const TEAM_MEMBERS: { id: TeamMember; color: string }[] = [
  { id: "Silvia", color: "#7bbd53" },
  { id: "Krithika", color: "#29804b" },
  { id: "Santiago", color: "#5cb85c" },
  { id: "Alejandra", color: "#8bc34a" },
  { id: "Austin", color: "#294e27" },
  { id: "Client", color: "#c97a32" },
];

export type Task = {
  id: string;
  label: string;
  owner: TeamMember;
  completed: boolean;
  blocked: boolean;
  blockReason?: string;
  completedAt?: string;
};

export type CopyApprovalStatus = "not-started" | "drafted" | "reviewed" | "sent-to-client" | "approved";

export type AccessStatus = "not-requested" | "requested" | "received";

export type ClientAccess = {
  name: string;
  status: AccessStatus;
};

export type Client = {
  id: string;
  name: string;
  currentStage: Stage;
  stageStartedAt: string; // ISO date
  createdAt: string;
  // Intake data (can come from intake form later)
  icp?: string;
  industry?: string;
  kickoffDate?: string;
  // Strategic Brief (the "north star" doc)
  strategicBrief?: string;
  // Copy approval tracking
  copyApprovalStatus: CopyApprovalStatus;
  copyApprovalSentAt?: string;
  // Access tracking
  accesses: ClientAccess[];
  // Tasks per stage
  tasks: Record<Stage, Task[]>;
};

export const DEFAULT_ACCESSES: ClientAccess[] = [
  { name: "HubSpot / CRM", status: "not-requested" },
  { name: "Email Inbox Access", status: "not-requested" },
  { name: "LinkedIn Access", status: "not-requested" },
  { name: "Ad Account Access", status: "not-requested" },
  { name: "Domain / DNS Access", status: "not-requested" },
];

// Default task checklist per stage — based on Silvia's actual process
export function defaultTasksForStage(stage: Stage): Task[] {
  const stamp = Date.now();
  const make = (label: string, owner: TeamMember): Task => ({
    id: `${stage}-${Math.random().toString(36).slice(2, 9)}-${stamp}`,
    label,
    owner,
    completed: false,
    blocked: false,
  });

  switch (stage) {
    case "onboarding":
      return [
        make("Austin notifies contract signed (PandaDoc)", "Austin"),
        make("Create internal + external Slack channels", "Silvia"),
        make("Send welcome message to client", "Silvia"),
        make("Send intake form to client", "Silvia"),
        make("Complete intake form", "Client"),
        make("Run kick-off call", "Silvia"),
        make("Populate Notion client workspace with call notes", "Silvia"),
      ];
    case "icp-brief":
      return [
        make("Finalize ICP segments", "Silvia"),
        make("Austin approves ICP", "Austin"),
        make("Write Strategic Brief (north star doc)", "Silvia"),
        make("Identify pain points + decision makers", "Silvia"),
        make("Define exclusion criteria", "Silvia"),
      ];
    case "campaign-build":
      return [
        make("First-pass lead list research in Clay", "Alejandra"),
        make("Build final lead list in Clay", "Krithika"),
        make("Write cold email sequences", "Krithika"),
        make("Set up automations + CRM integration", "Santiago"),
        make("Collect tool accesses from client", "Client"),
        make("Submit copy draft", "Krithika"),
        make("Internal copy review (24h SLA)", "Silvia"),
        make("Send copy to client for approval", "Silvia"),
        make("Client approves copy (48h SLA)", "Client"),
        make("Brief SDR (if applicable)", "Silvia"),
      ];
    case "live":
      return [
        make("Complete internal QA checklist", "Silvia"),
        make("Sign off on launch", "Silvia"),
        make("Launch campaigns in Instantly", "Krithika"),
        make("Notify client in external Slack channel", "Silvia"),
        make("Schedule Day 14 check-in call", "Silvia"),
      ];
    case "optimizing":
      return [
        make("Monitor campaign performance daily", "Krithika"),
        make("Weekly performance report to client", "Silvia"),
        make("Iterate copy based on reply data", "Krithika"),
        make("Weekly sync call with client", "Silvia"),
      ];
  }
}

export function createEmptyClient(name: string): Client {
  const now = new Date().toISOString();
  return {
    id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    currentStage: "onboarding",
    stageStartedAt: now,
    createdAt: now,
    copyApprovalStatus: "not-started",
    accesses: DEFAULT_ACCESSES.map((a) => ({ ...a })),
    tasks: {
      onboarding: defaultTasksForStage("onboarding"),
      "icp-brief": defaultTasksForStage("icp-brief"),
      "campaign-build": defaultTasksForStage("campaign-build"),
      live: defaultTasksForStage("live"),
      optimizing: defaultTasksForStage("optimizing"),
    },
  };
}

export function daysInStage(client: Client): number {
  const start = new Date(client.stageStartedAt).getTime();
  const now = Date.now();
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

export function hasBlockers(client: Client): boolean {
  return client.tasks[client.currentStage].some((t) => t.blocked && !t.completed);
}

export function stageProgress(client: Client): { done: number; total: number; pct: number } {
  const tasks = client.tasks[client.currentStage];
  const done = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}
