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

IMPORTANT: If you modify the plan, after your conversational response, output the separator "___UPDATED_PLAN___" on its own line, followed by the complete updated plan in markdown. This allows the app to update the displayed plan.

If the user is just asking a question (not requesting an edit), just respond conversationally without the separator.

Prospect context:
- Company: ${formData.prospectCompany}
- Prospect: ${formData.prospectFirstName} ${formData.prospectLastName}
- What they sell: ${formData.whatDoTheySell}
- ACV: ${formData.avgContractValue}`;

    const messages: Anthropic.MessageParam[] = [
      ...chatHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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
