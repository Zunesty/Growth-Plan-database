// Optional Slack notification after an auto-draft. Best-effort: never throws
// into the drafting path.
export async function notify(webhookUrl: string | undefined | null, text: string): Promise<void> {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("[followup-slack] notification failed:", (e as Error).message);
  }
}
