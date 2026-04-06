import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { transcript, sheetData, clientName, phase, clarificationAnswers, chatHistory, currentDraft } = await req.json();

    let systemPrompt: string;
    let userMessage: string;

    const sheetSummary = sheetData
      .map((tab: { mapTo: string; headers: string[]; rows: string[][] }) => {
        const header = tab.headers.join(" | ");
        const rows = tab.rows.map((r: string[]) => r.join(" | ")).join("\n");
        return `### ${tab.mapTo}\n${header}\n${rows}`;
      })
      .join("\n\n");

    if (phase === "clarification") {
      // Phase 2: One-shot clarification
      systemPrompt = `You are a precise, minimalist data analyst and executive assistant at Zunesty.

RULES:
- Rely ONLY on the provided Google Sheets data for metrics. NEVER hallucinate numbers.
- Rely entirely on the user's voice dump for sentiment, vibe, and qualitative insights.
- You are allowed ONLY ONE response to ask clarifying questions. Consolidate ALL doubts into a single bulleted list.
- Be concise. No fluff.

Your task: Review the voice transcript and the Google Sheets data for ${clientName}. Identify any gaps, contradictions, or missing context. Ask ALL your clarifying questions in ONE message as a bulleted list.

If everything is clear and you have no questions, respond with exactly: "NO_QUESTIONS — Ready to generate the report."`;

      userMessage = `## Voice Dump Transcript
${transcript}

## Google Sheets Data for ${clientName}
${sheetSummary}`;
    } else if (phase === "draft") {
      // Phase 3: Generate draft
      systemPrompt = `You are a precise, minimalist data analyst and executive assistant at Zunesty.

RULES:
- Rely ONLY on the provided Google Sheets data for metrics. NEVER hallucinate or invent numbers.
- Rely on the voice dump for sentiment and qualitative insights.
- Format the report for slide-deck consumption — clean, punchy, minimal.
- Use short paragraphs, bullet points, and bold headers.

REPORT TEMPLATE:
Format the output as a client report with these sections:

# Client Report: ${clientName}
*Report Date: [today's date]*

## Executive Summary
2-3 sentences. Overall status, sentiment, trajectory.

## Key Metrics
Pull ONLY from the Google Sheets data. Present as a clean table or bullet list.
- Include SDR performance metrics if available
- Include outbound/cold email metrics if available
- Bold the most important numbers

## Performance Highlights
What's working well. Be specific with numbers from the data.

## Areas of Concern
What needs attention. Reference specific data points.

## Sentiment & Vibe Check
Based on the voice dump. Capture the qualitative feel — how the client relationship is going, their mood, any red flags or green flags.

## Recommended Actions
3-5 specific, actionable next steps based on the data and voice insights.

## Notes
Any additional context from the voice dump that doesn't fit above.

---

Keep it TIGHT. No filler. Every sentence should carry information.`;

      userMessage = `## Voice Dump Transcript
${transcript}

## Google Sheets Data for ${clientName}
${sheetSummary}

${clarificationAnswers ? `## Clarification Answers\n${clarificationAnswers}` : ""}

Generate the report now.`;
    } else if (phase === "chat") {
      // Phase 3 continued: Chat refinement
      systemPrompt = `You are a precise, minimalist data analyst and executive assistant at Zunesty.

You have generated a client report draft. The user wants to refine it.

Current Report Draft:
---
${currentDraft}
---

RULES:
- If the user asks for edits, respond briefly acknowledging the change, then output the separator "___UPDATED_REPORT___" followed by the COMPLETE updated report.
- If they're just asking a question, respond conversationally without the separator.
- Maintain the same clean, minimal formatting throughout.
- NEVER hallucinate metrics — only use numbers from the original data.

Client: ${clientName}`;

      const messages: Anthropic.MessageParam[] = [
        ...(chatHistory || []).map((msg: { role: string; content: string }) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      ];

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
    } else {
      return Response.json({ error: "Invalid phase" }, { status: 400 });
    }

    // Stream response for clarification and draft phases
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
  } catch (error) {
    console.error("Reporting generate error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate report" },
      { status: 500 }
    );
  }
}
