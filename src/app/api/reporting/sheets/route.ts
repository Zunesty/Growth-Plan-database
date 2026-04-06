import { google } from "googleapis";
import { NextRequest } from "next/server";
import { CLIENTS, type SheetData } from "@/lib/reporting-types";

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json();

    const client = CLIENTS.find((c) => c.id === clientId);
    if (!client) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }

    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!credentialsJson) {
      return Response.json(
        { error: "Google service account not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON in .env.local" },
        { status: 400 }
      );
    }

    const credentials = JSON.parse(credentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const results: SheetData[] = [];

    for (const tab of client.tabs) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: client.sheetId,
          range: `'${tab.name}'`,
        });

        const values = response.data.values || [];
        if (values.length > 0) {
          results.push({
            tabName: tab.name,
            mapTo: tab.mapTo,
            headers: values[0],
            rows: values.slice(1),
          });
        }
      } catch (tabError) {
        console.error(`Error fetching tab ${tab.name}:`, tabError);
        results.push({
          tabName: tab.name,
          mapTo: tab.mapTo,
          headers: [],
          rows: [],
        });
      }
    }

    return Response.json({ client: client.name, data: results });
  } catch (error) {
    console.error("Sheets error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sheet data" },
      { status: 500 }
    );
  }
}
