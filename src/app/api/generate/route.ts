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

CRITICAL TONE RULE: ALWAYS speak DIRECTLY to the prospect using "you" and "your". NEVER refer to them in third person (e.g., NEVER say "Here's what ${prospectFirstName} needs to understand" — instead say "Here's what you need to understand"). The prospect will be reading this document. Address them directly throughout.

Output the plan in this exact format:

---

# ${prospectCompany} Growth Plan by ${salespersonName}

> 💡 For ${icp}: **How to get you from ${currentState} to ${endState} by increasing revenue by [calculate ONE realistic monthly ROI figure based on their ACV of ${avgContractValue}] per month in 12 months without ${whatTheyDontWant}**

IMPORTANT: The callout above MUST be exactly ONE sentence. Do not expand it. Do not add extra lines. Keep it punchy and concise exactly as formatted above — just fill in the revenue figure.

---

# Results (Case Studies)

> **Evidence that we deliver and that this 4-step method is currently effective for leading organisations.**

Do NOT make up case studies. Instead, output exactly this:

> 📎 **[View our case studies here →](#case-studies)**
> *Our detailed case studies with real results are maintained separately and linked here for accuracy.*

Then add a brief 2-3 sentence teaser about the types of results Zunesty has delivered for companies similar to ${prospectCompany} (keep it general, do NOT invent specific company names or specific numbers).

---

# Unique Insights and Advantage in Partnering with Zunesty

### Our relationship enables us to leverage:
- Your education
- Your experience
- Your successes
- Your knowledge / access

Customize this section for ${prospectCompany}. Explain how Zunesty's strategic partnerships validate strategies across world-leading organisations. Our founders have scaled 4 businesses — from EdTech, Marketing, Growth Partnering and Consultancy & Coaching — growing their current business from 0 to $4.8M annual revenue in 18 months. Mention: weekly meetings for insights, constantly learning/testing with a community of leaders, continuous development in business growth.

### Our commitment to your success:
1. **Weekly meetings to gain insights on new strategies** to improve results and overcome challenges
2. **Constantly learning and testing with community of leaders** to stay ahead of a competitive market
3. **Continuous development in business growth** and outside-of-the-box solutions

> Only a select few have access to this — we are one step ahead of the market on business growth.

---

# The Why

Write a compelling section explaining why you (${prospectFirstName}) should work with a Growth Partner instead of other options. Address them directly.

Explain that you can grow revenue by hiring staff or working with agencies, BUT:
- It's challenging to hire good people — if they're good at sales or marketing, they already have a 6-figure job or run their own business
- Most people looking for jobs don't know how to get results
- CEOs have to work with agencies but the agency model is suboptimal

**Why agencies don't work:**
- Agencies are incentivised by bringing on NEW clients — their focus is not on YOUR success
- They're limited on time and deliver templated services
- The few successful agencies grow by outsourcing your work to low-level staff who don't know how to get results
- Full service agencies have no focus on revenue; performance agencies only fix one part of the funnel

**Why hiring directly is risky:**
- Sales Manager: £80K+ | Salesperson: £50K+ | Marketing Manager: £20-60K = £150K+ minimum
- 50% of hires don't work out
- A+ talent is already making $100K+
- Sales and marketing teams don't collaborate well

**Marketing has changed:**
- It's not like a few years ago where you could send cold emails or run Facebook ads and get leads instantly
- Markets are more sophisticated, companies need to do more to get the same results

**The Growth Partner model:**
- A Growth Partner works with only a few clients, becoming an extension of your team
- Incentives align because profits are driven by YOUR success
- A Growth Partner essentially becomes an investor in your business — one that advises AND does the work
- Creating a win-win scenario — the relationships that last

---

# Insights

## What Can You Expect?

GUARDRAILS: Do NOT promise specific revenue figures in this section. Do NOT promise more than "20+ qualified new business opportunities each month". Keep promises realistic and grounded.

Customize these bullet points for ${prospectCompany}:
- Increased revenue and profits in 3-5 months
- A trusted full-time partner working hard and smart to grow your business
- Applying a proven growth method to accumulate free cash flow without guesswork
- Never compete as a commodity — get the price you deserve and never race to the bottom against competitors
- A new system that finds and converts your dream clients into high-paying customers — 20+ qualified new business opportunities each month
- New sales and marketing assets that enable you to close prospects you've never been able to reach before
- Insights and new strategies from the best sales and marketing professionals in the world
- Scale your business whilst reducing dependency on you, freeing you up to focus on priority tasks
- Increase your enterprise value to prepare for any upcoming financial event

---

# 4 Step Growth Plan to Increase Revenue

---

## Step 1: Go-to-Market — Build a highly-profitable offer with sales and marketing assets that your dream prospects love

Write a DETAILED section (at least 15-20 paragraphs including bullets/quotes). Address ${prospectFirstName} directly as "you". Include ALL of these points:

**Why do most companies in your space not reach their full potential?**
- They're not looking at growing their business from a holistic perspective
- They're focusing too much on the product and features when selling and marketing
- They struggle to communicate the true value they provide to their customer

> **Result?** They don't reach their full potential, stagnate or even collapse.

> **Alternative?** A holistic perspective on growth.

Explain: Focusing on the product is great because it improves your clients' experience. But being able to effectively communicate what problems you're solving, how, and who you've done it for is just as important. That's marketing and sales — but not in the sense most people think. It's marketing and sales focused on optimising WHOSE problems to solve and WHY they came to you.

> **How to achieve this?** A data-driven mindset.

You've been running your business, so you have happy clients. SPEAK TO THEM. They will tell you what they were struggling with before, what other solutions they tried, how much they spent, and what made them buy from you.

> That's a GOLDMINE full of information.

Would you not like to work with people who get the best results, are very happy, and bring you referrals?

> Here's how we do it…

**Interview your best clients and dream prospects!** Ask about their problems, desires, dreams, fears, frustrations, how you helped, what quantifiable results they obtained, what other solutions they tried and why those didn't work.

> Don't accept surface level answers — get to know them on a deeper level!

Explain how to turn insights into sales assets:
1. **Record the interview** (with permission) and share on website and LinkedIn — this becomes a case study and powerful social proof
2. **Create your offer and marketing claim** based on what clients said was most important

Then explain the Buyer's Pyramid:
- 3% buying now
- 6-7% open to it
- 30% not thinking about it
- 30% don't think they're interested
- 30% know they're not interested

Explain: To get a client over the line, you need multiple meetings, pitches, customised proposals — and even then they might say no.

> The key to unlocking the 97% of the market: Education-based marketing (covered in Step 2).

---

## Step 2: Education-Based Marketing — Fill up your pipeline with qualified prospects

Write a DETAILED section (at least 12-15 paragraphs). Address ${prospectFirstName} directly.

At this stage we understand we need: case studies, a marketing claim, and education-based marketing to attract prospects.

> So now, we need to figure out how to get in front of your potential clients

Evaluate channels honestly:
- **Ads** — high cost, high risk, difficult in many B2B industries${whatTheyDontWant.toLowerCase().includes("ad") ? ` (and you've said you don't want this)` : ""}
- **Referrals** — unreliable, you can't decide the scale
- **SEO and blogs** — take a very long time, most don't do it right
- **Cold calling** — SDRs churn quickly, you burn potential relationships${whatTheyDontWant.toLowerCase().includes("cold") ? ` (and you've told us this is off the table)` : ""}

> That leaves us with **outbound email prospecting**

Many companies are afraid this will ruin their reputation or "doesn't work for us." And it can be true — only if done incorrectly.

> But we've found the solution: **relevant education-based marketing**

We create email campaigns inviting your ideal potential clients to a virtual keynote on a topic very relevant to the trends and problems in their industry.

This is VERY different from how most lead generation companies work. They only care about getting a response or a call booked. Our approach takes the entire sales process into account. Because you can't take "number of meetings booked" to the bank.

> How we **guarantee success** with education-based cold email campaigns:

**Let's do some maths…**
- 6 domains, 3 inboxes per domain = 18 Email Accounts
- Sending 35 Emails Each Per Day = 630 Emails Per Day
- 3% Lead Rate = 18.9 Leads Per Day

**18 Leads Per Day (at a low ball)**

> No one is giving these kinds of numbers in outbound prospecting! Most companies would be happy with 10 leads per month.

We're now getting positive responses from qualified prospects. But this is still 2 steps away from money in the bank. We need to turn responses into meetings, then close them.

---

## Step 3: Sales Development — Schedule 20+ new business meetings every month

Write a DETAILED section (at least 12-15 paragraphs). Address ${prospectFirstName} directly.

**So now we:**
- ✅ Have case studies of your most successful clients
- ✅ Have a marketing claim that promises a transformation your clients desire
- ✅ Are attracting hundreds of prospects with education-based marketing

Now, we need someone to convert interest into sales meetings on your calendar.

> This is simple, but not easy.

Explain WHY it's hard:
- This is EXTREMELY time-consuming — nurturing a cold lead at director level to join a sales call
- Doing this effectively diverts focus from other key business development activities
- Finding a good sales person or SDR is like finding a needle in a haystack
- They do exist, but you'll pay an arm and a leg, and keeping them is a struggle

> There are 2 keys to success here:
1. Hiring a competent team member
2. **Motivating and training them to turn positive responses into booked meetings at a high rate**

Explain: We personally handle this, OR we retain SDRs with a package that heavily incentivises high performance and shows a progression path beyond just compensation.

> Because remember — there will always be someone ready to outspend you

We use a framework that outperforms the market:
1. Acknowledge what they're saying
2. Commoditize their rejection (if it's there)
3. Frame your response in a positive light

This removes reliance on templates and gives freedom to be creative while following a proven structure. We manage the full process day-to-day so you can focus on higher-leverage activities.

> Now we have a reliable, outbound prospecting machine running. The next step is to turn these booked calls into money in the bank…

---

## Step 4: Sales Collaboration — Increase sales and improve cash flow with a 3-step sales process

Write a DETAILED section (at least 12-15 paragraphs). Address ${prospectFirstName} directly.

**Now we:**
- ✅ Have case studies of your most successful clients
- ✅ Have a marketing claim that promises a transformation your clients desire
- ✅ Are attracting hundreds and thousands of prospects with education-based marketing
- ✅ Are booking meetings with interested prospects

> We need to turn that interest into cash in the bank.

Reference the Buyer's Pyramid again. Most don't understand it or forget about it. We take advantage of it.

> Sales today has 3 very BIG problems when marketing to new customers (without referrals):

- ⛔️ **Oversaturated market** — people are fed up with "solutions" that promise the world and don't deliver
- ⛔️ **Sophisticated buyers** — they educate themselves and know the criteria for good solutions
- ⛔️ **Lack of trust** — they understand most solutions can't be trusted

> Luckily, we've found a solution to all these problems. Here's how it works:

**Keynote** — an opportunity to showcase your expertise, add value, and deliver a soft pitch for your offer.

Explain how a keynote boosts ROI, where it fits in the sales cycle, what it entails (Introduction section, Close section).

---

## Bonus: Scale & Celebrate — Empower Your Team for Continued Growth

> **Scale your success by empowering your team.**

It's time to celebrate what has been achieved. Congratulate team members and create energy that drives more success.

One of the most challenging but highest-leverage activities a business leader can do is mobilise their team effectively. **Growth becomes all about the people.**

We work with CEOs to build additional revenue from roots to flourishing.

> **Now track, review and audit the processes to improve the results**

You can now expand into new locations and sub-niches and drastically increase revenue without putting additional pressure on yourself and your business leaders.

Once sales and marketing are dialled in, we cut, systematise, and delegate work to mobilise existing team members and new virtual assistants to **scale 10x** without increasing your workload.

> **We are now working ON the business instead of IN the business.**

---

# Next Steps

## From Here...

Keep this short and sweet. Two paths:

> **Operate without a structured growth plan.**
Keep building a fantastic product and hope that prospects will come. This is likely to result in missed opportunities and potential market share loss.

> **Work together with a proven model.**
You don't have to waste money, time and attention testing what works. We guarantee results at a fraction of the cost and in a fraction of the time. Three years of advancement in just three months!

---

## Revenue Growth

**How to add [calculate a realistic monthly revenue goal based on their ACV and market] of new revenue!**

Based on the call: you are targeting ${icp}.

Show realistic numbers:
- Estimate number of prospects available in their market (be specific to their niche)
- Ticket size: ${avgContractValue}
- Booked call rate: 0.9%
- Qualified rate: 80%
- Close rate: 30%

Show the calculation step by step. Example format:
**[Number] prospects**
- 0.9% will book a meeting = [X] booked calls
- 80% of those will be qualified = [X] qualified prospects
- 30% of those will close = [X] sales
**[X] clients × ${avgContractValue} = $[total]**

If there are multiple market segments they could target, show 2-3 separate calculations and then a combined total.

> **$[total] new revenue from a channel that [frame positively — e.g., "requires zero ad spend and no cold calling"]**

Overall, this will allow you to achieve: ${endState}

---

# Our Delivery / What We Do for You

## What Working Together Looks Like

> **4 Week Sprint for Results!**

### Onboarding meeting:
1. Introductions of team members
2. Share overview of initial 3 month plan
3. Get additional details required for launch

### Week 1-2:
1. Review current sales, marketing and product activities to learn your business — look for quick wins
2. Start collecting case studies
3. Collaborate on how we present the offer/value to increase profits
4. Start preparing for launch — building your prospect database

### Week 3:
1. Create campaigns for priority prospects
2. Write 5 different campaigns to test market message resonance

### Week 4:
1. Launch outbound campaigns
2. Review and optimise campaigns daily
3. Start booking new business development opportunities

### Onwards:
Focus on improving key metrics by optimising campaigns and collaborating on the sales process. Monthly sprints of focus on key priorities. Weekly growth reporting and strategic consulting.

## Value Stack — What You Get

Create a VALUE TABLE showing what Zunesty delivers vs. what it would cost to hire in-house. Format as a list with values:

For each service/pillar from the 4-step plan, show:
- **Service name** — brief description — **In-house cost: $[X]/year**

Example format:
- **Sales Collaboration** — Coach sales team, review sales calls, manage your pipeline — **$50,000/year**
- **Education-Based Marketing** — Full outbound campaigns, email prospecting, lead generation — **$60,000/year**
- **Go-to-Market Strategy** — Offer creation, case studies, marketing claims, positioning — **$40,000/year**
- **Sales Development** — SDR management, meeting booking, prospect nurturing — **$65,000/year**
- **Strategic Consulting** — Weekly growth meetings, campaign optimisation, market insights — **$80,000/year**

Customize the services and values based on ${prospectCompany}'s specific needs from the discovery call. Make the individual values realistic for their industry.

**Total in-house value: $[sum all values]/year**

> **You get all of this for a fraction of the cost. See Partnership Options below.**

## Your Team's Role:
1. Take the new business development calls/meetings (booked by us)
2. Feedback progress on sales to allow us to continuously improve marketing and support with sales enablement
3. Meet weekly to drive project forward and feed insights

## Our Guarantee

- ☐ Double your investment in 12 months
- ☐ Have someone else do the work
- ☐ Onboard new clients
- ☐ New assets for your business
- ☐ Increase your organisation's enterprise value by increasing B2B revenue and pipeline
- ☐ Turbocharge your sales and client acquisition

> **Value of £200k+**
> To guarantee results for our partners, we will only work with you until we get results and do not work with any competitors.

---

# Partnership Options

Create TWO partnership options using callout blocks. Format them exactly like this:

> 🥇 **Option 1: [Name] — $[price]/month**
>
> **Setup Fee:** $[amount] (If you sign by [date 2 weeks from now], we'll waive the setup fee and reduce the retainer by [X]%)
>
> What's included:
> - [Detail 1 — specific to their needs]
> - [Detail 2]
> - [Detail 3]
> - [Detail 4]
>
> **Best for:** [who this option suits]

> 🥈 **Option 2: [Name] — $[price]/month**
>
> **Setup Fee:** $[amount]
>
> What's included:
> - [Detail 1]
> - [Detail 2]
> - [Detail 3]
>
> **Best for:** [who this option suits]

PRICING GUIDANCE: You are an expert growth partner, agency operator, and business strategist. Based on ${prospectCompany}'s size, their ACV of ${avgContractValue}, what they sell (${whatDoTheySell}), and the realistic cost to fulfill the 4-step growth plan we've outlined, recommend pricing that:
1. Is profitable for Zunesty (consider fulfillment costs: email infrastructure, SDR costs, tools, time)
2. Represents clear ROI for the prospect (should be a fraction of the projected revenue growth)
3. Has a higher-tier option that includes more hands-on involvement
4. Uses a sign-by deadline to create urgency
Do NOT just guess numbers. Think about what it actually costs to deliver this and price accordingly.

> Zero ad spend!

### ROI Analysis

Show a simple ROI comparison for the recommended option:
- Investment: $[monthly price] × 12 = $[annual]
- Projected new revenue: $[from Revenue Growth section]
- **ROI: [X]x return on investment**

---

IMPORTANT RULES:
- ALWAYS address ${prospectFirstName} directly as "you" and "your". NEVER use third person.
- Be HIGHLY specific to ${prospectCompany}. Reference their actual numbers, problems, industry from the discovery call.
- Each of the 4 Steps should be DETAILED — at least 12-15 paragraphs each with bullets, quotes, and explanations.
- Calculate realistic numbers in Revenue Growth based on their ACV and market.
- Keep the tone professional but conversational — like a trusted advisor, not a salesperson.
- Use bold, callout blocks (> ), emoji checkmarks (✅ ⛔️), and lists extensively for readability.
- The callout at the top MUST be exactly one sentence.
- Do NOT promise specific revenue figures in the "What Can You Expect" section.
- Do NOT invent fake case study companies — link to real ones.
- Partnership Options MUST use the callout block format with emojis.
- Value Stack MUST show in-house costs for each service.`;

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
