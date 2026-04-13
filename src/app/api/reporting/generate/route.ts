import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { CLIENTS } from "@/lib/reporting-types";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { clientId, formValues, context, phase, currentDraft, chatHistory } = await req.json();

    const client = CLIENTS.find((c) => c.id === clientId);
    if (!client) {
      return Response.json({ error: "Client not found" }, { status: 400 });
    }

    // Build a clean summary of the form data, organized by section
    const formattedData = client.sections
      .map((section) => {
        const lines = section.fields
          .map((field) => {
            const value = formValues[field.key];
            if (!value) return null;
            const displayValue =
              field.type === "currency"
                ? `$${value}`
                : field.type === "percent"
                ? `${value}%`
                : value;
            return `- ${field.label}: ${displayValue}`;
          })
          .filter(Boolean);

        if (lines.length === 0) return null;
        return `### ${section.title}\n${lines.join("\n")}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (phase === "draft") {
      const systemPrompt = `You are a precise, minimalist data analyst and executive assistant at Zunesty.

RULES:
- Use ONLY the numbers from the form data provided. NEVER hallucinate or invent metrics.
- Use the user's context for sentiment, qualitative insights, and the "vibe" of the client relationship.
- Output should be CLEAN, PUNCHY, and ready for slide-deck consumption.
- Use short paragraphs, bullets, and bold for emphasis.
- No filler. Every sentence carries information.

CLIENT REPORT TEMPLATE:

# ${client.name} Client Report
*Reporting Period: [infer from context, default to "This Week"]*

## Executive Summary
2-3 sentences capturing overall status, sentiment, and trajectory.

## Key Metrics
Present the form data cleanly. Group by section. Bold the most important numbers.

## Performance Highlights
What's working. Reference specific numbers from the data.

## Areas of Concern
What needs attention. Reference specific data points.

## Sentiment & Vibe Check
From the user's context. Capture the qualitative feel — relationship health, mood, red/green flags.

## Recommended Next Steps
3-5 specific, actionable items based on the data + context.

## Notes
Anything else from the context that doesn't fit above.

---

Keep it TIGHT. This goes into a Gamma slide deck — assume the reader scans, doesn't read.`;

      const userMessage = `## Client: ${client.name}

## Form Data (THE ONLY METRICS — DO NOT INVENT NUMBERS)
${formattedData || "(No form data provided)"}

## Context from User
${context || "(No additional context provided)"}

Generate the report now.`;

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (phase === "chat") {
      const systemPrompt = `You are a precise, minimalist data analyst and executive assistant at Zunesty.

You generated a client report draft for ${client.name}. The user wants to refine it.

Current Report Draft:
---
${currentDraft}
---

Original Form Data (DO NOT INVENT NEW NUMBERS):
${formattedData}

Original Context:
${context}

RULES:
- If the user asks for edits, briefly acknowledge, then output "___UPDATED_REPORT___" on its own line, followed by the COMPLETE updated report. Output the ENTIRE report — no truncation.
- If they're just asking a question, respond conversationally without the separator.
- Maintain the same clean, minimal formatting throughout.
- NEVER hallucinate metrics — only use numbers from the form data.`;

      const messages: Anthropic.MessageParam[] = (chatHistory || []).map(
        (msg: { role: string; content: string }) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })
      );

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: systemPrompt,
        messages,
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return Response.json({ error: "Invalid phase" }, { status: 400 });
  } catch (error) {
    console.error("Reporting generate error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate report" },
      { status: 500 }
    );
  }
}
