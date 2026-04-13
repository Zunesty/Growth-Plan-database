export type ClientField = {
  key: string;
  label: string;
  type: "number" | "text" | "percent" | "currency";
  placeholder?: string;
};

export type ClientSection = {
  title: string;
  description?: string;
  fields: ClientField[];
};

export type ClientConfig = {
  id: string;
  name: string;
  gammaTemplateId?: string; // Gamma template gammaId — fill in once you have it
  sections: ClientSection[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ReportingPhase = "input" | "drafting";

// Generic placeholder fields — customize per client once we know what each client tracks
const GENERIC_SDR_SECTION: ClientSection = {
  title: "SDR Performance",
  description: "This week's SDR/outbound activity numbers",
  fields: [
    { key: "meetingsBooked", label: "Meetings Booked", type: "number", placeholder: "0" },
    { key: "meetingsHeld", label: "Meetings Held", type: "number", placeholder: "0" },
    { key: "showRate", label: "Show Rate (%)", type: "percent", placeholder: "0" },
    { key: "qualifiedMeetings", label: "Qualified Meetings", type: "number", placeholder: "0" },
  ],
};

const GENERIC_OUTBOUND_SECTION: ClientSection = {
  title: "Outbound Performance",
  description: "Cold email + outbound campaign metrics",
  fields: [
    { key: "emailsSent", label: "Emails Sent", type: "number", placeholder: "0" },
    { key: "replies", label: "Total Replies", type: "number", placeholder: "0" },
    { key: "positiveReplies", label: "Positive Replies", type: "number", placeholder: "0" },
    { key: "replyRate", label: "Reply Rate (%)", type: "percent", placeholder: "0" },
  ],
};

const GENERIC_SALES_SECTION: ClientSection = {
  title: "Sales Performance",
  description: "Pipeline + closed deals",
  fields: [
    { key: "dealsClosed", label: "Deals Closed", type: "number", placeholder: "0" },
    { key: "revenueGenerated", label: "Revenue Generated", type: "currency", placeholder: "0" },
    { key: "pipelineValue", label: "Pipeline Value", type: "currency", placeholder: "0" },
    { key: "closeRate", label: "Close Rate (%)", type: "percent", placeholder: "0" },
  ],
};

// All clients — currently using generic sections. Customize per client.
export const CLIENTS: ClientConfig[] = [
  {
    id: "revx",
    name: "RevX",
    gammaTemplateId: undefined, // TODO: add Gamma template gammaId for RevX
    sections: [GENERIC_SDR_SECTION, GENERIC_OUTBOUND_SECTION, GENERIC_SALES_SECTION],
  },
  {
    id: "sparknovus",
    name: "Spark Novus",
    gammaTemplateId: undefined, // TODO: add Gamma template gammaId for Spark Novus
    sections: [GENERIC_SDR_SECTION, GENERIC_OUTBOUND_SECTION, GENERIC_SALES_SECTION],
  },
  {
    id: "marketingops",
    name: "MarketingOps",
    gammaTemplateId: undefined, // TODO: add Gamma template gammaId for MarketingOps
    sections: [GENERIC_SDR_SECTION, GENERIC_OUTBOUND_SECTION, GENERIC_SALES_SECTION],
  },
  {
    id: "naturalstacks",
    name: "Natural Stacks",
    gammaTemplateId: undefined, // TODO: add Gamma template gammaId for Natural Stacks
    sections: [GENERIC_SDR_SECTION, GENERIC_OUTBOUND_SECTION, GENERIC_SALES_SECTION],
  },
];
