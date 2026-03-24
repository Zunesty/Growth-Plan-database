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

    const prompt = `You are a senior Growth Partner at Zunesty. Create a comprehensive, personalized Growth Plan proposal for a prospect based on the information below. Follow the EXACT structure provided — this matches our Notion template.

## Prospect Information
- **Growth Partner (Salesperson):** ${salespersonName}
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

## INSTRUCTIONS

Create the Growth Plan following this EXACT structure. Use markdown. Be highly specific to this prospect — reference their actual business, numbers, problems, and goals. Never be generic. Use a professional but conversational tone.

Output the plan in this exact format:

---

# ${prospectCompany} Growth Plan by ${salespersonName}

> 💡 For ${icp}: **How to get you from** **${currentState}** **to** **${endState}** **by increasing revenue by [calculate a realistic ROI figure based on their ACV of ${avgContractValue} and the math model below] per month in 12 months without** **${whatTheyDontWant}**

---

# Results (Case Studies)

> **Evidence that we deliver and that this 4-step method is currently effective for leading organisations.**

Write 2-3 brief case study summaries of similar companies Zunesty has helped (make these realistic and relevant to ${prospectCompany}'s industry). Include company type, challenge, and results achieved.

---

# Unique Insights and Advantage in Partnering with Zunesty

### Our relationship enables us to leverage:
- Your education
- Your experience
- Your successes
- Your knowledge / access

Explain Zunesty's strategic partnerships and how we validate strategies across world-leading organisations. Mention the commitment: weekly meetings for insights, constantly learning/testing with community of leaders, continuous development in business growth.

> Only a select few have access to this - We are one step ahead of the market on business growth.

---

# The Why

Write a compelling section explaining why ${prospectCompany} should work with a Growth Partner instead of:
1. **Agencies** - They're incentivised by bringing on new clients, limited on time, deliver templated services. Full service agencies have no focus on revenue. Performance agencies only fix one part of the funnel.
2. **Hiring directly** - Expensive (Sales Manager £80K+, Salesperson £50K+, Marketing Manager £20-60K = £150K+ minimum), 50% don't work out, A+ talent already making $100K+.

Frame it around: Marketing has changed. Markets are more sophisticated. The agency model makes money for agency owners but won't drive the growth ${prospectCompany} needs. A Growth Partner becomes an investor in their business — incentives align because profits are driven by ${prospectCompany}'s success. Win-win.

---

# Insights

## What Can You Expect?
Based on ${prospectCompany}'s situation, list specific expectations:
- Increased revenue and profits in 3-5 months
- A trusted full-time partner working to grow the business
- A proven growth method without guesswork
- Never compete as a commodity
- A system that finds and converts dream clients — 20+ qualified opportunities/month
- New sales and marketing assets
- Scale whilst reducing dependency on ${prospectFirstName}
- Increase enterprise value

---

# 4 Step Growth Plan to Increase Revenue

---

## Step 1: Go-to-Market — Build a highly-profitable offer with sales and marketing assets that ${prospectCompany}'s dream prospects love

**Why do most ${whatDoTheySell} companies not reach their full potential?**
- Not looking at growth holistically
- Focusing too much on product/features when selling
- Struggling to communicate true value

> **Result?** They stagnate or don't reach potential.

> **Alternative?** Holistic perspective on growth.

Explain the data-driven approach: Interview best clients and dream prospects. Ask about problems, desires, what other solutions they tried, why those didn't work. Create case studies. Build an offer and marketing claim that solves dream clients' #1 problem.

Explain the Buyer's Pyramid:
- 3% buying now
- 6-7% open to it
- 30% not thinking about it
- 30% don't think they're interested
- 30% know they're not interested

> The key: to unlock the 97%, you need education-based marketing (covered next).

---

## Step 2: Education-Based Marketing — Fill up ${prospectCompany}'s pipeline with qualified prospects

At this stage we have: case studies, a marketing claim, and need to get in front of prospects.

Evaluate channels:
- Ads — high cost, high risk (and ${prospectFirstName} doesn't want: ${whatTheyDontWant})
- Referrals — unreliable, can't scale
- SEO — takes too long
- Cold calling — high churn, burns relationships

> Solution: **Relevant education-based outbound email prospecting**

We create email campaigns inviting ${icp} to a virtual keynote on a topic relevant to their industry problems.

**Math model for ${prospectCompany}:**
- 6 domains × 3 inboxes = 18 email accounts
- 35 emails each per day = 630 emails/day
- 3% lead rate = ~18 leads per day

> No one gives these numbers in outbound prospecting. Most companies would be happy with 10 leads per month.

---

## Step 3: Sales Development — Schedule 20+ new business meetings every month

Now we have case studies, marketing claim, and are attracting prospects. Need to convert interest into booked meetings.

Explain:
- This is extremely time-consuming (nurturing cold leads at director level)
- Finding good SDRs is like finding a needle in a haystack
- Two keys: hiring competent team members + motivating/training them

Framework for responses:
1. Acknowledge what they're saying
2. Commoditize their rejection
3. Frame response positively

We manage the full process day-to-day so ${prospectFirstName} can focus on higher-leverage activities.

---

## Step 4: Sales Collaboration — Increase sales and improve cash flow with a 3-step sales process

Reference the Buyer's Pyramid again. Sales in today's market has 3 big problems:
- ⛔️ Oversaturated market
- ⛔️ Sophisticated buyers
- ⛔️ Lack of trust

> Solution: **Keynote approach** — showcase expertise, add value, deliver soft pitch.

Explain how the keynote boosts ROI, fits into the sales cycle, and what it entails.

---

## Celebratory Dinner: Scale Success by Empowering the Team

Once the system works, it's time to celebrate and scale. Growth becomes about people. We work with CEOs to build additional revenue from roots to flourishing.

Track, review, and audit processes. Expand into new locations/sub-niches. Cut, systematise, and delegate to scale 10x without increasing ${prospectFirstName}'s workload.

> We are now working ON the business instead of IN the business.

---

# Next Steps

## From Here...
Summarize the two paths:
1. Working with agencies or hiring directly (expensive, unreliable, not holistic)
2. Working together with a proven model — don't waste money testing what works. We guarantee results at a fraction of the cost. Three years of advancement in just three months.

---

## Revenue Growth

**How to add [calculate realistic monthly revenue goal] of new revenue!**

Based on the call: ${prospectCompany} is targeting ${icp}.

Do the math:
- [Estimate number of prospects available in their market]
- Ticket size: ${avgContractValue}
- Booked call rate: 0.9%
- Qualified rate: 80%
- Close rate: 30%

Show the calculation step by step and arrive at a monthly revenue figure.

> **[Revenue figure] new revenue from a channel that [frame positively based on what they don't want to do]**

Overall, this will allow ${prospectCompany} to achieve: ${endState}

---

# Our Delivery / What We Do for You

## What Working Together Looks Like
> **4 Week Sprint for Results!**

### Onboarding meeting:
1. Introductions of team members
2. Share overview of initial 3 month plan
3. Get additional details required for launch

### Week 1-2:
1. Review current sales, marketing and product activities
2. Start collecting case studies
3. Collaborate on offer/value presentation
4. Build prospect database

### Week 3:
1. Create campaigns for priority prospects
2. Write 5 different campaigns to test market resonance

### Week 4:
1. Launch outbound campaigns
2. Review and optimise daily
3. Start booking new business meetings

### Onwards:
Focus on improving key metrics by optimising campaigns and collaborating on sales. Monthly sprints. Weekly growth reporting and strategic consulting.

## What We Do & What You Do

**Your team:**
1. Take the new business development calls/meetings (booked by us)
2. Feedback progress on sales for continuous improvement
3. Meet weekly to drive project forward

## Our Guarantee
- ☐ Double your investment in 12 months
- ☐ Have someone else do the work
- ☐ Onboard new clients
- ☐ New assets for your business
- ☐ Increase enterprise value by growing B2B revenue and pipeline
- ☐ Turbocharge sales and client acquisition

> **Value of £200k+**
> To guarantee results, we will only work with you until we get results and do not work with any competitors.

---

# Partnership Options

Present 2 options:
1. **Set-up & Initiation** — starter package for getting the system running
2. **Full Growth Partnership** — ongoing partnership with comprehensive support

Include pricing tiers that make sense for ${prospectCompany}'s size and ACV of ${avgContractValue}.

> Zero ad spend!

Break down the value and ROI of the recommended option.

---

IMPORTANT RULES:
- Be HIGHLY specific to ${prospectCompany} and ${prospectFirstName}. Reference their actual numbers, problems, industry.
- Use the discovery call transcript details extensively.
- Calculate realistic numbers in the Revenue Growth section based on their ACV and market.
- Keep the tone professional but conversational — like a trusted advisor, not a salesperson.
- Use bold, callout blocks (>), and lists extensively for readability.
- Every section should feel personalized, not templated.`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
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
