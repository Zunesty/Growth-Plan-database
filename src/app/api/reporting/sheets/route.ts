import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
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
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const doc = new GoogleSpreadsheet(client.sheetId, auth);
    await doc.loadInfo();

    const results: SheetData[] = [];

    for (const tab of client.tabs) {
      try {
        const sheet = doc.sheetsByTitle[tab.name];
        if (!sheet) {
          results.push({ tabName: tab.name, mapTo: tab.mapTo, headers: [], rows: [] });
          continue;
        }

        await sheet.loadHeaderRow();
        const headers = sheet.headerValues;
        const rows = await sheet.getRows();

        results.push({
          tabName: tab.name,
          mapTo: tab.mapTo,
          headers,
          rows: rows.map((row) => headers.map((h) => row.get(h) || "")),
        });
      } catch (tabError) {
        console.error(`Error fetching tab ${tab.name}:`, tabError);
        results.push({ tabName: tab.name, mapTo: tab.mapTo, headers: [], rows: [] });
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
