import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    const {
      salespersonName, prospectFirstName, prospectLastName, prospectCompany,
      interviewTranscript, discoveryTranscript, whatDoTheySell, icp,
      avgContractValue, biggestProblem, whatTheyDontWant, currentState, endState,
    } = data;

    const prompt = `You are a senior marketing strategist at Zunesty, a MarketingOps agency. Create a comprehensive, personalized Growth Plan proposal for a prospect based on the information provided below.

## Prospect Information
- **Salesperson:** ${salespersonName}
- **Prospect:** ${prospectFirstName} ${prospectLastName}
- **Company:** ${prospectCompany}
- **What They Sell:** ${whatDoTheySell}
- **ICP (Ideal Customer Profile):** ${icp}
- **Average Contract Value:** ${avgContractValue}
- **Biggest Problem:** ${biggestProblem}
- **What They Don't Want to Do:** ${whatTheyDontWant}
- **Current State:** ${currentState}
- **Desired End State:** ${endState}

${interviewTranscript ? `## Interview Call Transcript\n${interviewTranscript}\n` : ""}

## Discovery Call Transcript
${discoveryTranscript}

---

## Instructions

Create a detailed MarketingOps Growth Plan in the following format. Use markdown formatting. Make it highly specific to this prospect — reference their actual business, problems, and goals throughout. Do NOT be generic.

Structure the plan as follows:

# Growth Plan: ${prospectCompany}
*Prepared by ${salespersonName} | Zunesty*

## Executive Summary
Brief overview of the prospect's situation, key challenges, and how Zunesty will help them reach their end state. Keep it to 3-4 sentences max.

## Current State Analysis
- Where they are now
- Key pain points identified from the discovery call
- What's holding them back

## Desired End State
- Where they want to be
- Specific goals and metrics they care about

## The Problem
Deep dive into their biggest challenge. Reference specific things from the discovery call.

## Our Recommended Strategy
### Phase 1: Foundation (Month 1)
### Phase 2: Growth (Months 2-3)
### Phase 3: Scale (Months 4-6)

For each phase, include:
- Specific tactics and actions
- Expected outcomes
- Key deliverables

## What We Will NOT Do
Based on what they don't want, explicitly state what's off the table and why that's fine.

## Projected Outcomes
- Specific, measurable outcomes tied to their goals
- Timeline expectations
- ROI projections based on their ACV of ${avgContractValue}

## Investment & Next Steps
- Recommended engagement structure
- Suggested next steps to get started

## Why Zunesty
Brief, confident closing on why Zunesty is the right partner for this.

---

Make the tone professional but approachable. Be specific, not vague. Use actual numbers and specifics from the call data. The plan should feel custom-made for ${prospectFirstName}, not templated.`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
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
    console.error("Generate error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate growth plan" },
      { status: 500 }
    );
  }
}
