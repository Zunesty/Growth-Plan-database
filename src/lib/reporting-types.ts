export type ClientField = {
  key: string;
  label: string;
  type: "number" | "text" | "percent" | "currency" | "textarea";
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
  gammaTemplateId?: string;
  sections: ClientSection[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ReportingPhase = "input" | "drafting";

// Shared "Next Steps & Performance Improvements" section used by all clients
const NEXT_STEPS_SECTION: ClientSection = {
  title: "Next Steps & Performance Improvements",
  description: "Top 3 priorities for the coming week",
  fields: [
    { key: "nextStep1", label: "Next Step 1", type: "text", placeholder: "e.g. Launch new cold email sequence" },
    { key: "nextStep1Note", label: "Note 1", type: "textarea", placeholder: "Brief context..." },
    { key: "nextStep2", label: "Next Step 2", type: "text", placeholder: "e.g. Review sales call recordings" },
    { key: "nextStep2Note", label: "Note 2", type: "textarea", placeholder: "Brief context..." },
    { key: "nextStep3", label: "Next Step 3", type: "text", placeholder: "e.g. Refine ICP messaging" },
    { key: "nextStep3Note", label: "Note 3", type: "textarea", placeholder: "Brief context..." },
  ],
};

export const CLIENTS: ClientConfig[] = [
  // ─── RevX ─────────────────────────────────────────────
  {
    id: "revx",
    name: "RevX",
    gammaTemplateId: "g_a6c8e0w430hwwfo",
    sections: [
      {
        title: "SDR Outreach Summary",
        fields: [
          { key: "sdrBookedMeetings", label: "Booked Meetings", type: "number", placeholder: "0" },
          { key: "sdrPositiveReplies", label: "Positive Replies & Conversations", type: "number", placeholder: "0" },
          { key: "sdrCallsMade", label: "Calls Made", type: "number", placeholder: "0" },
          { key: "sdrEmailFollowUps", label: "Email Follow Ups Sent", type: "number", placeholder: "0" },
        ],
      },
      {
        title: "Outbound Performance",
        fields: [
          { key: "outboundBookedMeetings", label: "Booked Meetings", type: "number", placeholder: "0" },
          { key: "outboundPositiveReplies", label: "Positive Replies & Conversations", type: "number", placeholder: "0" },
          { key: "outboundCallsMade", label: "Calls Made", type: "number", placeholder: "0" },
          { key: "outboundEmailFollowUps", label: "Email Follow Ups Sent", type: "number", placeholder: "0" },
        ],
      },
      NEXT_STEPS_SECTION,
    ],
  },

  // ─── Spark Novus ──────────────────────────────────────
  {
    id: "sparknovus",
    name: "Spark Novus",
    gammaTemplateId: "g_mtpkrnyv32i6xrl",
    sections: [
      {
        title: "Sales Summary",
        fields: [
          { key: "bookedMeetings", label: "Booked Meetings", type: "number", placeholder: "0" },
          { key: "revenueClosed", label: "Revenue Closed", type: "currency", placeholder: "0" },
          { key: "closeRate", label: "Close Rate", type: "percent", placeholder: "0" },
          { key: "averageContractValue", label: "Average Contract Value", type: "currency", placeholder: "0" },
        ],
      },
      {
        title: "Outbound Performance",
        fields: [
          { key: "outboundBookedMeetings", label: "Booked Meetings", type: "number", placeholder: "0" },
          { key: "outboundPositiveReplies", label: "Positive Replies & Conversations", type: "number", placeholder: "0" },
          { key: "outboundCallsMade", label: "Calls Made", type: "number", placeholder: "0" },
          { key: "outboundEmailFollowUps", label: "Email Follow Ups Sent", type: "number", placeholder: "0" },
        ],
      },
      NEXT_STEPS_SECTION,
    ],
  },

  // ─── MarketingOps ─────────────────────────────────────
  {
    id: "marketingops",
    name: "MarketingOps",
    gammaTemplateId: "g_wjtp2ug5qiommct",
    sections: [
      {
        title: "Key Goals",
        description: "Top 3 goals for this period",
        fields: [
          { key: "goal1", label: "Goal 1", type: "text", placeholder: "e.g. Hit $500K ARR in sponsorship" },
          { key: "goal2", label: "Goal 2", type: "text", placeholder: "..." },
          { key: "goal3", label: "Goal 3", type: "text", placeholder: "..." },
        ],
      },
      {
        title: "Pipeline Overview",
        fields: [
          { key: "closedWonRevenue", label: "Closed Won Revenue", type: "currency", placeholder: "0" },
          { key: "forecastedRevenue", label: "Current Forecasted Revenue", type: "currency", placeholder: "0" },
          {
            key: "forecastedDeals",
            label: "Forecasted Deals Breakdown",
            type: "textarea",
            placeholder: "Deal 1 - $X,XXX\nDeal 2 - $X,XXX\nDeal 3 - $X,XXX",
          },
          { key: "annualCloseRate", label: "Annual Close Rate Average", type: "percent", placeholder: "0" },
          { key: "bookedSalesCalls", label: "Booked Sales Calls", type: "number", placeholder: "0" },
        ],
      },
      {
        title: "Marketing Summary — Cold Email",
        description: "Active cold email campaign stats",
        fields: [
          { key: "coldEmailCampaignName", label: "Campaign Name", type: "text", placeholder: "e.g. Q2 Enterprise Outreach" },
          { key: "coldEmailSent", label: "Sent", type: "number", placeholder: "0" },
          { key: "coldEmailPositiveReplies", label: "Positive Replies", type: "number", placeholder: "0" },
          { key: "coldEmailBookedCalls", label: "Booked Calls", type: "number", placeholder: "0" },
        ],
      },
      {
        title: "Nurture Campaigns",
        fields: [
          { key: "nurtureCampaign1", label: "Campaign 1", type: "text", placeholder: "Campaign name" },
          { key: "nurtureCampaign2", label: "Campaign 2", type: "text", placeholder: "Campaign name" },
        ],
      },
      {
        title: "Membership SDR Outreach",
        description: "Coming soon — leave blank if not applicable yet",
        fields: [
          { key: "membershipSalesMade", label: "Sales Made", type: "number", placeholder: "0" },
          { key: "membershipPositiveReplies", label: "Positive Replies & Conversations", type: "number", placeholder: "0" },
          { key: "membershipSlackMessages", label: "Slack Messages Sent", type: "number", placeholder: "0" },
          { key: "membershipEmailsSent", label: "Emails Sent", type: "number", placeholder: "0" },
        ],
      },
      NEXT_STEPS_SECTION,
    ],
  },

  // ─── Natural Stacks ───────────────────────────────────
  {
    id: "naturalstacks",
    name: "Natural Stacks",
    gammaTemplateId: "g_my5nnfw1s45051k",
    sections: [
      {
        title: "Key Goals",
        fields: [
          { key: "goal1", label: "Goal 1", type: "text", placeholder: "..." },
          { key: "goal2", label: "Goal 2", type: "text", placeholder: "..." },
          { key: "goal3", label: "Goal 3", type: "text", placeholder: "..." },
        ],
      },
      {
        title: "DTC — Email Marketing",
        fields: [
          { key: "emailAttributedRevenue", label: "Attributed Revenue", type: "currency", placeholder: "0" },
          { key: "emailOpenRate", label: "Open Rate", type: "percent", placeholder: "0" },
          { key: "emailCTR", label: "CTR", type: "percent", placeholder: "0" },
          {
            key: "topPerformingCampaigns",
            label: "Top Performing Campaign Emails",
            type: "textarea",
            placeholder: "List top performing email campaigns...",
          },
        ],
      },
      {
        title: "DTC — Other",
        fields: [
          { key: "dtcOtherProjectOverview", label: "Project Overview", type: "textarea", placeholder: "What's happening in DTC beyond email..." },
          { key: "dtcSocialMedia", label: "Social Media", type: "textarea", placeholder: "Social media updates, metrics, wins..." },
        ],
      },
      {
        title: "Retail",
        fields: [
          { key: "retailProjectOverview", label: "Project Overview", type: "textarea", placeholder: "Retail project status..." },
          { key: "retailRecentAssets", label: "Recent Assets", type: "textarea", placeholder: "Assets created or delivered..." },
        ],
      },
      {
        title: "Branding & Design",
        fields: [
          { key: "brandingProjectOverview", label: "Project Overview", type: "textarea", placeholder: "Branding work in progress..." },
          { key: "brandingRecentAssets", label: "Recent Assets", type: "textarea", placeholder: "Assets created or delivered..." },
        ],
      },
      {
        title: "Campaign Ideas & Marketing Strategy",
        description: "Upcoming campaign ideas with cost + impact estimates",
        fields: [
          { key: "idea1", label: "Idea 1", type: "text", placeholder: "Campaign name/idea" },
          { key: "idea1Cost", label: "Idea 1 — Estimated Cost", type: "currency", placeholder: "0" },
          { key: "idea1Impact", label: "Idea 1 — Impact", type: "textarea", placeholder: "Expected impact..." },
          { key: "idea2", label: "Idea 2", type: "text", placeholder: "Campaign name/idea" },
          { key: "idea2Cost", label: "Idea 2 — Estimated Cost", type: "currency", placeholder: "0" },
          { key: "idea2Impact", label: "Idea 2 — Impact", type: "textarea", placeholder: "Expected impact..." },
        ],
      },
      NEXT_STEPS_SECTION,
    ],
  },
];
