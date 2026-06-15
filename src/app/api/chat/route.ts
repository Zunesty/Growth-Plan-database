import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const { currentPlan, message, chatHistory, formData } = await req.json();

    const systemPrompt = `You are Zunesty's Growth Plan assistant. The user has a generated growth plan and wants to refine it.

Current Growth Plan:
---
${currentPlan}
---

Your job:
1. Respond to the user's request conversationally (briefly)
2. If they ask for edits, output the FULL updated growth plan after your response

IMPORTANT: If you modify the plan, after your conversational response, output the separator "___UPDATED_PLAN___" on its own line, followed by the COMPLETE updated plan in markdown. You MUST output the ENTIRE plan — every section from the title through Partnership Options. Do NOT truncate, summarize, or skip sections. The app replaces the displayed plan with your output, so missing sections will be lost.

If the user is just asking a question (not requesting an edit), just respond conversationally without the separator.

CRITICAL FORMAT RULES:
- The main callout MUST follow: "For [job title] of [Niche]: How to get you from [current state] to [desired state] by increasing revenue by [figure] per month in 12 months without [something they don't want]"
- Always address the prospect as "you" — never third person
- [STATIC] sections must remain exactly as they are
- Keep the exact markdown heading structure (# for H1, ## for H2, ### for H3)

Prospect context:
- Company: ${formData.prospectCompany}
- Prospect: ${formData.prospectFirstName} ${formData.prospectLastName}
- What they sell: ${formData.whatDoTheySell}
- ICP: ${formData.icp}
- ACV: ${formData.avgContractValue}
- Current State: ${formData.currentState}
- Desired End State: ${formData.endState}
- What They Don't Want: ${formData.whatTheyDontWant}`;

    const messages: Anthropic.MessageParam[] = [
      ...chatHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
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
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}
