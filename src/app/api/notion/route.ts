import { Client } from "@notionhq/client";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const notionKey = process.env.NOTION_API_KEY;
  const notionDbId = process.env.NOTION_DATABASE_ID;

  if (!notionKey) {
    return Response.json(
      { error: "Notion API key not configured. Set NOTION_API_KEY in your .env.local file." },
      { status: 400 }
    );
  }

  try {
    const { plan, prospectName, prospectCompany, salespersonName } = await req.json();

    const notion = new Client({ auth: notionKey });

    // Parse the markdown plan into ordered elements (headings, sub-pages, inline content)
    const elements = parsePlanIntoElements(plan);

    // Create the main page with just the first batch of blocks (before any child pages)
    const pageTitle = `${prospectCompany} Growth Plan by ${salespersonName || prospectName}`;
    const firstBatch = collectBlocksUntilChildPage(elements, 0);

    const pageParams: Parameters<typeof notion.pages.create>[0] = notionDbId
      ? {
          parent: { database_id: notionDbId },
          properties: {
            title: { title: [{ text: { content: pageTitle } }] },
          },
          icon: { type: "emoji", emoji: "🚀" as "💡" },
          children: firstBatch.blocks.slice(0, 100),
        }
      : {
          parent: { page_id: process.env.NOTION_PAGE_ID || "" },
          properties: {
            title: { title: [{ text: { content: pageTitle } }] },
          },
          icon: { type: "emoji", emoji: "🚀" as "💡" },
          children: firstBatch.blocks.slice(0, 100),
        };

    const page = await notion.pages.create(pageParams);
    const pageId = page.id;

    // If first batch had more than 100 blocks, append the rest
    if (firstBatch.blocks.length > 100) {
      for (let i = 100; i < firstBatch.blocks.length; i += 100) {
        const batch = firstBatch.blocks.slice(i, i + 100);
        await notion.blocks.children.append({ block_id: pageId, children: batch });
      }
    }

    // Now process remaining elements sequentially — this preserves order
    let idx = firstBatch.nextIndex;
    while (idx < elements.length) {
      const el = elements[idx];

      if (el.type === "child_page") {
        // Create child page as a block on the main page (this puts it inline)
        const subBlocks = markdownToNotionBlocks(el.content);
        const childPage = await notion.pages.create({
          parent: { page_id: pageId },
          properties: {
            title: { title: [{ text: { content: el.title } }] },
          },
          icon: { type: "emoji", emoji: getSubPageIcon(el.title) as "💡" },
          children: subBlocks.slice(0, 100),
        });

        // Append remaining blocks if over 100
        if (subBlocks.length > 100) {
          for (let i = 100; i < subBlocks.length; i += 100) {
            const batch = subBlocks.slice(i, i + 100);
            await notion.blocks.children.append({ block_id: childPage.id, children: batch });
          }
        }

        idx++;

        // Now collect blocks until the next child page and append them
        const nextBatch = collectBlocksUntilChildPage(elements, idx);
        if (nextBatch.blocks.length > 0) {
          for (let i = 0; i < nextBatch.blocks.length; i += 100) {
            const batch = nextBatch.blocks.slice(i, i + 100);
            await notion.blocks.children.append({ block_id: pageId, children: batch });
          }
        }
        idx = nextBatch.nextIndex;
      } else {
        idx++;
      }
    }

    return Response.json({
      success: true,
      url: (page as Record<string, unknown>).url || null,
    });
  } catch (error) {
    console.error("Notion error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to push to Notion" },
      { status: 500 }
    );
  }
}

type NotionBlock = Parameters<typeof Client.prototype.blocks.children.append>[0]["children"][number];

type Element = {
  type: "block" | "child_page";
  title: string;
  content: string;
  blocks?: NotionBlock[];
};

// Sections that should become sub-pages (matched against ## headings)
const SUB_PAGE_SECTIONS = [
  "case studies",
  "unique advantage",
  "the why",
  "what can you expect",
  "bonus",
  "scale & celebrate",
  "from here",
  "revenue growth",
  "what working together",
  "value stack",
  "what we do",
  "what's included",
  "our guarantee",
  "partnership options",
];

// H1 sections that should ALSO become sub-pages (these collapse the entire H1 section into one child page)
const H1_SUB_PAGE_SECTIONS = [
  "next steps",
  "partnership options",
];

// Relevant emoji per sub-page, matched the same way as SUB_PAGE_SECTIONS above.
const SUB_PAGE_ICONS: { match: string; emoji: string }[] = [
  { match: "case studies", emoji: "🏆" },
  { match: "unique advantage", emoji: "⭐" },
  { match: "the why", emoji: "🤔" },
  { match: "what can you expect", emoji: "🔮" },
  { match: "bonus", emoji: "🎁" },
  { match: "scale & celebrate", emoji: "🎉" },
  { match: "next steps", emoji: "🧭" },
  { match: "revenue growth", emoji: "📈" },
  { match: "what working together", emoji: "🗓️" },
  { match: "value stack", emoji: "💰" },
  { match: "what's included", emoji: "📦" },
  { match: "what we do and what you do", emoji: "🧩" },
  { match: "our guarantee", emoji: "🛡️" },
  { match: "partnership options", emoji: "🤝" },
];

function getSubPageIcon(title: string): string {
  const lower = title.toLowerCase().trim();
  // Numbered steps (dynamic titles like "1. Positioning & Offer Creation")
  if (lower.startsWith("1.")) return "🎯";
  if (lower.startsWith("2.")) return "📣";
  if (lower.startsWith("3.")) return "💼";
  const found = SUB_PAGE_ICONS.find(({ match }) => lower.includes(match));
  return found ? found.emoji : "📄";
}

// Steps are matched separately — they start with "1.", "2.", "3." but we need to
// avoid matching things like "1. WORKING WITH AGENCIES" inside From Here
function isStepHeading(title: string): boolean {
  const lower = title.toLowerCase();
  // Match "1. Something" but NOT "1. WORKING WITH AGENCIES" or "2. HIRING DIRECTLY"
  if (/^\d+\./.test(lower)) {
    // Exclude known static sub-headings that should NOT be sub-pages
    if (lower.includes("working with agencies") || lower.includes("hiring directly")) {
      return false;
    }
    return true;
  }
  return false;
}

function shouldBeSubPage(title: string): boolean {
  const lower = title.toLowerCase();
  if (SUB_PAGE_SECTIONS.some(s => lower.includes(s))) return true;
  return isStepHeading(title);
}

function parsePlanIntoElements(markdown: string): Element[] {
  const lines = markdown.split("\n");
  const elements: Element[] = [];
  let currentContent: string[] = [];
  let currentSubPage: { title: string; content: string[]; isH1: boolean } | null = null;
  let inIntro = true;

  function flushInlineContent() {
    const text = currentContent.join("\n").trim();
    if (text) {
      const blocks = markdownToNotionBlocks(text);
      elements.push({ type: "block", title: "", content: text, blocks });
    }
    currentContent = [];
  }

  function flushSubPage() {
    if (currentSubPage) {
      elements.push({
        type: "child_page",
        title: currentSubPage.title,
        content: currentSubPage.content.join("\n"),
      });
      currentSubPage = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h1Match = line.match(/^# (.+)/);
    const h2Match = line.match(/^## (.+)/);

    if (h1Match) {
      inIntro = false;
      const h1Title = h1Match[1].trim();
      const h1Lower = h1Title.toLowerCase();

      // Check if this H1 should become a sub-page
      if (H1_SUB_PAGE_SECTIONS.some(s => h1Lower.includes(s))) {
        flushInlineContent();
        flushSubPage();
        currentSubPage = { title: h1Title, content: [], isH1: true };
      } else {
        // H1 stays on the main page as a heading
        flushSubPage();
        currentContent.push(line);
      }
    } else if (h2Match) {
      const title = h2Match[1].trim();

      if (shouldBeSubPage(title) && (!currentSubPage || !currentSubPage.isH1)) {
        // Create a new sub-page, but NOT if we're inside an H1-level sub-page (those absorb their H2s)
        flushInlineContent();
        flushSubPage();
        currentSubPage = { title, content: [], isH1: false };
      } else if (currentSubPage) {
        // h2 inside a sub-page — add it to sub-page content
        currentSubPage.content.push(line);
      } else {
        currentContent.push(line);
      }
    } else {
      if (currentSubPage) {
        currentSubPage.content.push(line);
      } else {
        if (inIntro || !h1Match) {
          currentContent.push(line);
        }
      }
    }
  }

  // Flush remaining
  flushSubPage();
  flushInlineContent();

  return elements;
}

function collectBlocksUntilChildPage(elements: Element[], startIdx: number): { blocks: NotionBlock[]; nextIndex: number } {
  const blocks: NotionBlock[] = [];
  let idx = startIdx;

  while (idx < elements.length) {
    if (elements[idx].type === "child_page") break;
    if (elements[idx].blocks) {
      blocks.push(...elements[idx].blocks!);
    }
    idx++;
  }

  return { blocks, nextIndex: idx };
}

function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.split("\n");
  const blocks: NotionBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) continue;

    // Headings
    if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: parseInlineMarkdown(line.slice(4)) },
      });
    } else if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: parseInlineMarkdown(line.slice(3)) },
      });
    } else if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: parseInlineMarkdown(line.slice(2)) },
      });
    }
    // Horizontal rule
    else if (line.trim() === "---" || line.trim() === "***") {
      blocks.push({
        object: "block",
        type: "divider",
        divider: {},
      });
    }
    // Callout (> with emoji)
    else if (line.trim().startsWith("> ")) {
      const content = line.trim().slice(2);
      const emojiMatch = content.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}])\s*/u);
      if (emojiMatch) {
        blocks.push({
          object: "block",
          type: "callout",
          callout: {
            rich_text: parseInlineMarkdown(content.slice(emojiMatch[0].length)),
            icon: { type: "emoji", emoji: emojiMatch[1] as "💡" },
            color: "gray_background",
          },
        });
      } else {
        blocks.push({
          object: "block",
          type: "callout",
          callout: {
            rich_text: parseInlineMarkdown(content),
            icon: { type: "emoji", emoji: "💡" as const },
            color: "gray_background",
          },
        });
      }
    }
    // Checkbox / to-do
    else if (line.trim().startsWith("- ☐ ") || line.trim().startsWith("- [ ] ")) {
      const content = line.trim().replace(/^- (?:☐|\[ \]) /, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: { rich_text: parseInlineMarkdown(content), checked: false },
      });
    }
    else if (line.trim().startsWith("- ☑ ") || line.trim().startsWith("- [x] ")) {
      const content = line.trim().replace(/^- (?:☑|\[x\]) /, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: { rich_text: parseInlineMarkdown(content), checked: true },
      });
    }
    // Checkmark bullet (✅)
    else if (line.trim().startsWith("✅")) {
      const content = line.trim().slice(1).replace(/^\s*-?\s*/, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: { rich_text: parseInlineMarkdown(content), checked: true },
      });
    }
    // Cross bullet (⛔️ / ⛔ / 🚫 / ❌)
    else if (
      line.trim().startsWith("⛔️") ||
      line.trim().startsWith("⛔") ||
      line.trim().startsWith("🚫") ||
      line.trim().startsWith("❌")
    ) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: parseInlineMarkdown(line.trim()) },
      });
    }
    // Bullet list
    else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const content = line.trim().slice(2);
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: parseInlineMarkdown(content) },
      });
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line.trim())) {
      const content = line.trim().replace(/^\d+\.\s/, "");
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: parseInlineMarkdown(content) },
      });
    }
    // Regular paragraph
    else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: parseInlineMarkdown(line) },
      });
    }
  }

  return blocks;
}

function parseInlineMarkdown(text: string): Array<{
  type: "text";
  text: { content: string };
  annotations?: { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean; color: "default" };
}> {
  const segments: Array<{
    type: "text";
    text: { content: string };
    annotations?: { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean; color: "default" };
  }> = [];

  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      segments.push({
        type: "text",
        text: { content: match[2] },
        annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" },
      });
    } else if (match[3]) {
      segments.push({
        type: "text",
        text: { content: match[3] },
        annotations: { bold: false, italic: true, strikethrough: false, underline: false, code: false, color: "default" },
      });
    } else if (match[4]) {
      segments.push({
        type: "text",
        text: { content: match[4] },
        annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: true, color: "default" },
      });
    } else if (match[5]) {
      segments.push({
        type: "text",
        text: { content: match[5] },
      });
    }
  }

  if (segments.length === 0) {
    segments.push({ type: "text", text: { content: text } });
  }

  return segments;
}
