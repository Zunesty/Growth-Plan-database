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

    const prompt = `You are a senior Growth Partner at Zunesty. Create a personalized Growth Plan proposal for a prospect. Follow the EXACT structure below — some sections are STATIC (you copy them exactly) and some are DYNAMIC (you customize for this prospect).

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

CRITICAL TONE RULE: ALWAYS speak DIRECTLY to the prospect using "you" and "your". NEVER refer to them in third person (e.g., NEVER say "Here's what ${prospectFirstName} needs to understand" — say "Here's what you need to understand").

Output the plan in this EXACT format. Sections marked [STATIC] must be copied EXACTLY as written. Sections marked [DYNAMIC] must be customized for this prospect.

---

# ${prospectCompany} Growth Plan by ${salespersonName}

> 💡 For ${icp}: **How to get you from ${currentState} to ${endState} by increasing revenue by [calculate ONE realistic monthly ROI figure based on their ACV of ${avgContractValue}] per month in 12 months without ${whatTheyDontWant}**

IMPORTANT: The callout above MUST be exactly ONE sentence. Keep it punchy and concise — just fill in the revenue figure. [DYNAMIC]

---

# Results

---

## Case Studies

[STATIC — copy exactly]

---

> **Evidence that we deliver and that this 3-step method is currently effective for leading organizations.**

### Amazing

> 💡 **Amazing** increased their revenue by $5.2M in just two years of working together. We changed their sales process, built out marketing funnels and assets, and created a system to transform their growth.

---

### Zoof

> 💡 **Zoof** scaled bootstrapped from $0 to $2M ARR in under a year using our targeted landing pages, acquisition system, and growth strategies. The founders are exploring exit options currently.

---

### Axcelerate AI

> 💡 **Axcelerate AI** got up to booking 15 new business meetings per month within 3 months of working together, and pitching 6-figure contracts to those prospects, using our outbound marketing systems and sales process.

---

[END STATIC]

---

## Unique Advantage of Partnering with Zunesty

[STATIC — copy exactly]

### Our relationship gives you access to our knowledge:
- Studied business development with the best marketers and salespeople in the world, and we continue to spend 5-figures per year on the best company accelerators, sales rep training, marketing strategies, and more.
- We have experience working across a multitude of companies and industries, including technology services, SaaS, enterprise software, e-commerce, coaching and training, consulting, and more. Our company has generated $21M in trackable sales for our clients and partners, and we're continuing.
- We also have access to the top business accelerators currently to review our campaigns, not just with our company, but with the top business development leaders in the space as well.

We have had strategic partnerships with over 50+ of our clients, driving business development, marketing, sales, and growth strategy over the past 7 years.

We also serve as the Demand Generation expert at a funded enterprise SaaS company that sells contracts worth $1M/yr to Fortune 1000 companies.

1. We've been able to help book meetings for our clients with companies like AGCO, Microsoft, Louis Vuitton, and more. 👇
2. We've been able to transform digital marketing, sales, and operations teams to help companies grow faster and remove bottlenecks.
3. We of course prioritize long-term relationships with clients and partners who are ready to grow their business, and we take our growth execution seriously.

### Our commitment to the success of our business together:
1. **Weekly meeting to gain insights on new strategies** to improve results for you and overcome challenges - campaign not producing results.
2. **Constantly learning and testing with community of leaders** to stay ahead of a competitive market - new sales processes.
3. **Continuous development in business growth** and outside of the box solutions - like "The Interview Method"!

> Only 50 people in the world have access to our strategies - We are one step ahead of the market on business growth.

[END STATIC]

---

# The Why

## The Why

[STATIC — copy exactly]

You can grow your revenue by hiring direct staff and working with marketing agencies.

But, it's challenging to hire good people because if you're good at sales or marketing, it's easy to get a 6-figure job or run your own business.

Most people looking for jobs don't know how to get results.

So CEOs like yourself have to work with agencies but the agency model is suboptimal for you.

Why?

Because agencies are incentivized by bringing on new clients, they're limited on time and deliver templated services.

> Check out this report for more context and key insights:
https://www.vendasta.com/content-library/insights/agency-benchmarks-report/

The small amount of agencies who are successful grow by outsourcing your work to low-level staff who don't know how to get results.

Getting results is harder…

Marketing has changed!

It's not like a few years ago where you could send cold emails or throw up advertisements on Facebook and get leads instantly.

The markets got more sophisticated resulting in companies having to do more and be more creative to get same results as before.

The agency model will still make money for agency owners but it's not likely to drive the results you need for growth!

That's why working with a Growth Partner that works with only a couple clients, they can become an extension of your team driving real revenue growth through improving key aspects from marketing to sales.

The incentives align because as a partner the profits and growth are driven by the success of your business…

A Growth Partner essentially becomes an investor in your business - one that advises AND does the work!

Creating a win-win scenario - that's the relationships that last!

[END STATIC]

---

# Insights

## What Can You Expect? [DYNAMIC]

GUARDRAILS: Do NOT promise specific revenue figures. Do NOT promise more than "20+ qualified new business opportunities each month". Keep promises realistic.

Customize these bullet points specifically for ${prospectCompany} and what ${prospectFirstName} told you on the discovery call:
- Increased revenue and profits in 3-5 months.
- A trusted full time partner working hard & smart to grow your business.
- [Add 5-7 more bullet points highly customized to their specific situation, problems, and goals from the discovery call. Reference their actual business, industry, and desired outcomes. Keep each bullet specific and actionable.]

---

# 3 Step Growth Plan to Increase Revenue

IMPORTANT: This is a 3-step plan (NOT 4). Create custom step titles that are specific to ${prospectCompany}'s business. Look at the discovery call to understand their business and create steps that make sense for THEIR situation.

For example, if they're a consulting firm: "1. Go-to-market: Build a consulting offer and positioning that your dream clients can't ignore"
If they're a SaaS company: "1. Product-Market Fit & Positioning: Define your ICP and create messaging that converts"
If they're a community/media company: "1. Sponsorship prospectus, pricing strategy, and beta monetization"

Each step should be specific to what ${prospectCompany} actually needs.

---

## 1. [Custom Title for Step 1 — specific to ${prospectCompany}] [DYNAMIC]

Write a DETAILED section (at least 15-20 paragraphs including bullets/quotes). Address ${prospectFirstName} directly as "you".

**Why do most ${whatDoTheySell.toLowerCase().includes("consult") ? "consulting" : whatDoTheySell.toLowerCase().includes("saas") ? "SaaS" : "companies in your space"} not reach their full potential?**
- [3 specific reasons related to their industry]

> **Result?**
[Specific consequence for their type of business]

> **Alternative?**
Holistic perspective on growth.

Then explain the data-driven approach — interviewing best clients, building case studies, creating offers based on insights. Include the Buyer's Pyramid:
- 3% buying now
- 6-7% open to it
- 30% not thinking about it
- 30% don't think they're interested
- 30% know they're not interested

> The key to unlocking the 97% of the market is covered in Step 2.

Include specific phases:
**Phase 1:** [Specific to their business]
**Phase 2:** [Specific to their business]
**Phase 3:** [Specific to their business]

---

## 2. [Custom Title for Step 2 — about marketing/lead generation specific to them] [DYNAMIC]

Write a DETAILED section (at least 12-15 paragraphs). Address ${prospectFirstName} directly.

**So now we have:**
- [Recap what Step 1 delivers for them]

Now, we need to build a consistent flow of leads.

Evaluate channels honestly for their specific business:
- **Ads** — high cost, high risk${whatTheyDontWant.toLowerCase().includes("ad") ? ` (and you've said you don't want this)` : ""}
- **Referrals** — unreliable, can't control scale
- **SEO and blogs** — takes too long
- **Cold calling** — burns relationships${whatTheyDontWant.toLowerCase().includes("cold") ? ` (and you've told us this is off the table)` : ""}

> That leaves us with **outbound email prospecting** combined with **education-based marketing**

Explain the email math:
- 6 domains, 3 inboxes per domain = 18 Email Accounts
- Sending 35 Emails Each Per Day = 630 Emails Per Day
- 3% Lead Rate = 18.9 Leads Per Day

**18 Leads Per Day (at a low ball)**

> No one is giving these kinds of numbers in outbound prospecting!

Include specifics about how this applies to reaching ${icp}.

---

## 3. [Custom Title for Step 3 — about sales/closing specific to them] [DYNAMIC]

Write a DETAILED section (at least 12-15 paragraphs). Address ${prospectFirstName} directly.

**Now we:**
✅ - Have case studies of your most successful clients
✅ - Have systems, pricing, and marketing to generate leads
✅ - Are booking meetings with potential clients

> We need to turn that interest into cash in the bank.

Explain the sales challenges:
⛔️ Oversaturated market
⛔️ Sophisticated buyers
⛔️ Lack of trust

> Luckily, we've found a solution: the Keynote method

Explain how keynotes boost ROI, where they fit in the sales cycle, and how the close works.

Include Dream 100 lists, pipeline management, and sales process specifics for their business.

---

## BONUS: [Custom bonus title — something specific to scaling ${prospectCompany}] [DYNAMIC]

Write about scaling their specific business. This is about:
- Celebrating success and empowering the team
- Reducing founder dependency
- Tracking, reviewing, and auditing processes
- Working ON the business instead of IN the business
- Specific scaling strategies for ${prospectCompany}

Make this highly specific to their business model and what they discussed on the call.

---

# Next Steps

## From Here... [STATIC — copy exactly]

> **The routes most businesses take to grow…**

---

## **1. WORKING WITH AGENCIES**

There are two main types of agencies:
1. Full service - deliver wide range of services with no focus on increasing your revenue ❌
2. Performance-based agencies - run Facebook ads, cold email campaigns❓

Think of your marketing to sales like a production line in a **car manufacturing plant**.

Performance-based agencies focus on providing a service that improves one specific part of your sales and marketing funnel - this can work if you have every other part of that funnel working well.

This performance-based agency might be an expert at painting - which could increase your business by 10-20%.

But let's say, we haven't put in the engine, **even with the best paint the car will not work**.

The engine in this case could be the sales assets, or sales collaboration (closing the gap between sales and marketing).

Based on where you are, there are other parts of the marketing to sales process that require focus.

Therefore, you need a holistic solution, not a specific one.

### Problems with agencies:
❌ You pay money to get a service when you really care about outcomes - most agencies lose projects after 3 months as a result of this.
❌ Agencies are incentivized by bringing on new clients so their focus as a business is not on your success - it's on selling more of their services to other clients similar to you.
❌ You hear all the promises, but none of them are guaranteed.
❌ You will incur direct expenses with no guarantee of profit and miss out on new business opportunities.

### 🤦 Agency's #1 goal is to bring on more clients…

## 📈 Our #1 goal is to help YOU make more PROFITS.

## **2. HIRING DIRECTLY**

Hire an internal team…

New Sales Manager, Salesperson, and Marketing Agency or Manager who attempt to put both together - all hires and mistakes take considerable amount of time and money.

The direct cost of (not to mention the time involved in recruitment, training and management):
- Sales Manager: $80K + Commission
- Salesperson: $50K + Commission
- Marketing Manager: $20-60k (NOTE: See evidence of results)
- **$150k per year minimum + 50% of staff don't work out.**

This is unlikely to get the results you want efficiently because sales and marketing do not collaborate well.

Also, A+ team members are already in roles making over $100,000 per year.

### What are your additional options?

> **Operate without a structured growth plan.**
Keep building a fantastic product, and hope that prospects will come.
This is likely to result in missed opportunities and potential market share loss.

> **Work together with a proven model.**
You don't have to waste money, time and attention testing what works and doesn't.
We guarantee results at a fraction of the cost and in a fraction of the time.
Three years of advancement in just three months!

[END STATIC]

---

## Revenue Growth [DYNAMIC]

**How to add [calculate a realistic monthly revenue goal based on their ACV and market] of new revenue!**

Based on the call: you are targeting ${icp}.

Show realistic numbers using their market:
- Estimate number of prospects available (be specific to their niche)
- Ticket size: ${avgContractValue}
- Booked call rate: 0.9%
- Qualified rate: 80%
- Close rate: 30%

Show the calculation step by step:
**[Number] prospects**
- 0.9% will book a meeting = [X] booked calls
- 80% of those will be qualified = [X] qualified prospects
- 30% of those will close = [X] sales
**[X] clients × ${avgContractValue} = $[total]**

If there are multiple market segments, show 2-3 separate calculations.

> **$[total] new revenue from a channel that [frame positively]**

Overall, this will allow you to achieve: ${endState}

---

# Our Delivery / What We Do for You

## What Working Together Looks Like [STATIC — copy exactly]

> **4 Week Sprint for Results!**

### **Onboarding meeting:**
1. Introductions of team members
2. Share overview of initial 3 month plan
3. Get additional details required for launch.

### **Week 1-2**
1. Review current sales, marketing and product activities to learn your business - see if there's any quick wins
2. Start collecting case studies
3. Collaborate on how we present the offer / value to increase profits
4. Start preparing for launch - building your prospect database

### **Week 3**
1. Create campaigns for priority 1 prospects
2. Write 5 x different campaigns to test market message resonance
3. Begin build out of necessary funnels for testing

### **Week 4**
1. Launch outbound campaigns
2. Review and optimize campaigns daily
3. Start booking in new business development opportunities
4. Begin scoping projects for other pillars within the plan (workshopping)

### **Onwards**
Focus on improving booked calls and closed sales by optimizing campaigns and collaborating on the sales process.
Monthly sprints of focus on key priorities to achieve short term milestone targets.
Weekly growth reporting and strategic consulting on business growth.

[END STATIC]

---

## What We Do and What You Do [DYNAMIC]

> **Our team**

**What We'll Do for You**

Create a VALUE TABLE specific to ${prospectCompany}. For each service from the 3-step plan, show:
- **Service name** — brief description — **Value: $[X]/year**

Make these specific to what we're actually delivering for ${prospectCompany} based on the steps above.

Example format:
- **Go-to-Market Strategy** — Offer creation, case studies, marketing claims, positioning — **Value: $40,000/year**
- **Education-Based Marketing** — Full outbound campaigns, email prospecting, lead generation — **Value: $60,000/year**
- **Sales Management** — Pipeline management, sales coaching, deal closing support — **Value: $65,000/year**
- **Strategic Consulting** — Weekly growth meetings, campaign optimization, market insights — **Value: $80,000/year**
- **SDR/BDR Function** — Meeting booking, prospect nurturing, lead qualification — **Value: $55,000/year**

Customize the services and values based on ${prospectCompany}'s specific needs. Make values realistic for their industry.

**Total in-house value: $[sum]/year**

> **Your team**

---
1. Implement the strategies we lay out for growing the business in sales & marketing functions
2. Feedback progress on sales to allow us to continuously improve marketing & support with sales enablement
3. Meet weekly to drive project forward and feed insights + any marketing and sales collateral that will help with the project success
4. Implement the strategies we work on together company wide and report on the data

---

## Our Guarantee [DYNAMIC]

Customize the guarantee checkboxes for ${prospectCompany}. Include:
- ☐ **Double your investment in 12 months — or we add 3 free months of free support in a BDR function**
- ☐ **Have someone else do the work**
- ☐ [2-3 more specific to their goals from the discovery call]
- ☐ **Turbocharge your sales and client acquisition**

> **Value of $[calculate total value from the value table above]+ per year**
> To guarantee results for our partners, we will only work with you until we get results and do not work with any direct competitors.

---

# Partnership Options [DYNAMIC]

Create TWO partnership options. IMPORTANT FORMATTING RULES:
- Use ONLY ONE callout line (with > ) for each option HEADER — the line with the emoji
- Use ONLY ONE callout line for each setup/initiation fee
- Everything else (details, bullets, descriptions) should be REGULAR text — NO ">" prefix
- Do NOT put bullet points inside callout blocks

Format EXACTLY like this (notice only the headers use >):

> 🥇 **Option 1: [Name]**

> **Setup & Initiation ($[amount])**

> **Setup & Initiation ($[amount])** — If you sign by [date 2 weeks from today, which is 2026-04-16], we'll waive the setup fee and reduce the retainer by [X]%

**What's included:**
- [Detail 1 — specific to their needs]
- [Detail 2]
- [Detail 3]
- [Detail 4]
- [Detail 5]
- [Detail 6]

**Best for:** [who this option suits]

---

> 🥈 **Option 2: [Name — optional upgrade or different scope]**

> **Optional Upgrade: [Description including what's extra beyond Option 1]**

**What's included (everything in Option 1 PLUS):**
- [Extra detail 1]
- [Extra detail 2]
- [Extra detail 3]

**Best for:** [who this option suits]

---

### Overview of Value to you:

> 💡 Zero ad spend!

PRICING GUIDANCE: You are an expert growth partner, agency operator, and business strategist. Based on ${prospectCompany}'s size, their ACV of ${avgContractValue}, what they sell (${whatDoTheySell}), and the realistic cost to fulfill the 3-step growth plan:
1. Is profitable for Zunesty (consider fulfillment costs: email infrastructure, SDR costs, tools, time)
2. Represents clear ROI for the prospect (fraction of projected revenue growth)
3. Has a higher-tier option with more hands-on involvement
4. Uses a sign-by deadline to create urgency
Do NOT just guess numbers. Think about actual delivery costs and price accordingly.

### ROI Analysis
- Investment: $[monthly price] × 12 = $[annual]
- Projected new revenue: $[from Revenue Growth section]
- **ROI: [X]x return on investment**

---

IMPORTANT RULES:
- ALWAYS address ${prospectFirstName} directly as "you" and "your". NEVER use third person.
- Be HIGHLY specific to ${prospectCompany}. Reference their actual numbers, problems, industry.
- [STATIC] sections MUST be copied EXACTLY as written — do NOT paraphrase or modify them.
- [DYNAMIC] sections should be highly customized using discovery call details.
- Each of the 3 Steps should be DETAILED — at least 12-15 paragraphs each.
- The callout at the top MUST be exactly one sentence.
- Do NOT promise specific revenue figures in "What Can You Expect".
- For Partnership Options: ONLY use ">" callout prefix for option headers and setup fees. ALL other content (bullets, descriptions, best for) should be regular text WITHOUT ">".
- Step titles MUST be custom to ${prospectCompany}'s business — not generic.
- This is a 3-STEP plan, not 4.`;

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
