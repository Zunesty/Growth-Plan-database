export type ClientConfig = {
  id: string;
  name: string;
  sheetId: string;
  tabs: { name: string; mapTo: string }[];
  gammaTemplateId?: string;
};

export type SheetData = {
  tabName: string;
  mapTo: string;
  headers: string[];
  rows: string[][];
};

export type ReportingPhase = "input" | "clarification" | "drafting" | "export";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Configured clients — add new clients here
export const CLIENTS: ClientConfig[] = [
  {
    id: "revx",
    name: "RevX",
    sheetId: "1VxohkQdc09Gt0Yi4P200Wp3GbUqdHpnT6Qs2J-cEzeQ",
    tabs: [
      { name: "SDR", mapTo: "SDR Performance" },
      { name: "Cold Email", mapTo: "Outbound" },
    ],
  },
];
