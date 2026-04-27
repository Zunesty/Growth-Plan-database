import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return Response.json(
      { error: "Slack webhook not configured. Set SLACK_WEBHOOK_URL in .env.local" },
      { status: 400 }
    );
  }

  try {
    const {
      eventType,
      clientName,
      fromStage,
      toStage,
      daysInPrevStage,
      nextOwner,
      blockReason,
      blockedTaskLabel,
      clientUrl,
    } = (await req.json()) as {
      eventType: "stage-change" | "blocker-added" | "client-added";
      clientName: string;
      fromStage?: string;
      toStage?: string;
      daysInPrevStage?: number;
      nextOwner?: string;
      blockReason?: string;
      blockedTaskLabel?: string;
      clientUrl?: string;
    };

    let message: Record<string, unknown>;

    if (eventType === "stage-change") {
      message = {
        text: `${clientName}: ${fromStage} → ${toStage}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `📈 ${clientName} moved to ${toStage}`, emoji: true },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*From:*\n${fromStage}` },
              { type: "mrkdwn", text: `*To:*\n${toStage}` },
              ...(daysInPrevStage !== undefined
                ? [{ type: "mrkdwn", text: `*Days in previous stage:*\n${daysInPrevStage}` }]
                : []),
              ...(nextOwner ? [{ type: "mrkdwn", text: `*Next owner:*\n${nextOwner}` }] : []),
            ],
          },
          ...(clientUrl
            ? [
                {
                  type: "actions",
                  elements: [
                    {
                      type: "button",
                      text: { type: "plain_text", text: "Open in pipeline", emoji: true },
                      url: clientUrl,
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    } else if (eventType === "blocker-added") {
      message = {
        text: `🚫 ${clientName} blocked: ${blockedTaskLabel}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `🚫 ${clientName} has a blocker`, emoji: true },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*Task:* ${blockedTaskLabel}\n*Reason:* ${blockReason}` },
          },
          ...(clientUrl
            ? [
                {
                  type: "actions",
                  elements: [
                    {
                      type: "button",
                      text: { type: "plain_text", text: "Open in pipeline", emoji: true },
                      url: clientUrl,
                      style: "danger",
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    } else if (eventType === "client-added") {
      message = {
        text: `✨ New client added to pipeline: ${clientName}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `✨ New client: ${clientName}`, emoji: true },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `${clientName} just entered the pipeline at *Onboarding*.` },
          },
          ...(clientUrl
            ? [
                {
                  type: "actions",
                  elements: [
                    {
                      type: "button",
                      text: { type: "plain_text", text: "Open in pipeline", emoji: true },
                      url: clientUrl,
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    } else {
      return Response.json({ error: "Unknown event type" }, { status: 400 });
    }

    const slackRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!slackRes.ok) {
      const errorText = await slackRes.text();
      throw new Error(`Slack error (${slackRes.status}): ${errorText}`);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Slack notify error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to send Slack notification" },
      { status: 500 }
    );
  }
}
