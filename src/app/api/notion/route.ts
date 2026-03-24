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
    const { plan, prospectName, prospectCompany } = await req.json();

    const notion = new Client({ auth: notionKey });

    // Parse the plan into sections for the main page and sub-pages
    const sections = parsePlanIntoSections(plan);

    // Build main page blocks (callout + headings with child pages)
    const mainBlocks = buildMainPageBlocks(sections);

    // Create the main page
    const pageTitle = `${prospectCompany} Growth Plan by ${prospectName}`;
    const pageParams: Parameters<typeof notion.pages.create>[0] = notionDbId
      ? {
          parent: { database_id: notionDbId },
          properties: {
            title: { title: [{ text: { content: pageTitle } }] },
          },
          children: mainBlocks.slice(0, 100),
        }
      : {
          parent: { page_id: process.env.NOTION_PAGE_ID || "" },
          properties: {
            title: { title: [{ text: { content: pageTitle } }] },
          },
          children: mainBlocks.slice(0, 100),
        };

    const page = await notion.pages.create(pageParams);
    const pageId = page.id;

    // If we have more than 100 blocks, append the rest
    if (mainBlocks.length > 100) {
      for (let i = 100; i < mainBlocks.length; i += 100) {
        const batch = mainBlocks.slice(i, i + 100);
        await notion.blocks.children.append({ block_id: pageId, children: batch });
      }
    }

    // Now create sub-pages for each major section
    for (const section of sections) {
      if (section.isSubPage && section.content.trim()) {
        const subBlocks = markdownToNotionBlocks(section.content);
        if (subBlocks.length > 0) {
          // Create child page
          const childPage = await notion.pages.create({
            parent: { page_id: pageId },
            properties: {
              title: { title: [{ text: { content: section.title } }] },
            },
            children: subBlocks.slice(0, 100),
          });

          // Append remaining blocks if over 100
          if (subBlocks.length > 100) {
            for (let i = 100; i < subBlocks.length; i += 100) {
              const batch = subBlocks.slice(i, i + 100);
              await notion.blocks.children.append({ block_id: childPage.id, children: batch });
            }
          }
        }
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

type Section = {
  title: string;
  content: string;
  isSubPage: boolean;
  level: number; // 1 = h1, 2 = h2
};

// Sections that should become sub-pages (matching the Notion template)
const SUB_PAGE_SECTIONS = [
  "results",
  "case studies",
  "unique insights",
  "advantage in partnering",
  "the why",
  "what can you expect",
  "go-to-market",
  "step 1",
  "education-based marketing",
  "step 2",
  "sales development",
  "step 3",
  "sales collaboration",
  "step 4",
  "celebratory dinner",
  "scale",
  "from here",
  "revenue growth",
  "what working together",
  "what we do",
  "our guarantee",
  "partnership options",
  "our delivery",
  "next steps",
];

function shouldBeSubPage(title: string): boolean {
  const lower = title.toLowerCase();
  return SUB_PAGE_SECTIONS.some(s => lower.includes(s));
}

function parsePlanIntoSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let introContent = "";

  for (const line of lines) {
    const h1Match = line.match(/^# (.+)/);
    const h2Match = line.match(/^## (.+)/);

    if (h1Match) {
      if (currentSection) sections.push(currentSection);
      else if (introContent.trim()) {
        sections.push({ title: "Intro", content: introContent, isSubPage: false, level: 0 });
      }
      const title = h1Match[1].trim();
      currentSection = {
        title,
        content: "",
        isSubPage: shouldBeSubPage(title),
        level: 1,
      };
    } else if (h2Match && currentSection) {
      // Check if this h2 should be its own sub-page
      const title = h2Match[1].trim();
      if (shouldBeSubPage(title)) {
        sections.push(currentSection);
        currentSection = {
          title,
          content: "",
          isSubPage: true,
          level: 2,
        };
      } else {
        currentSection.content += line + "\n";
      }
    } else {
      if (currentSection) {
        currentSection.content += line + "\n";
      } else {
        introContent += line + "\n";
      }
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

function buildMainPageBlocks(sections: Section[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  for (const section of sections) {
    if (section.level === 0) {
      // Intro content — check for callout (> line)
      const introBlocks = markdownToNotionBlocks(section.content);
      blocks.push(...introBlocks);
    } else if (section.isSubPage) {
      // Add a heading for context, then the sub-page reference is created separately
      if (section.level === 1) {
        blocks.push({
          object: "block",
          type: "heading_1",
          heading_1: { rich_text: [{ type: "text", text: { content: section.title } }] },
        });
      }
      blocks.push({
        object: "block",
        type: "divider",
        divider: {},
      });
    } else {
      // Non sub-page section — inline it
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: [{ type: "text", text: { content: section.title } }] },
      });
      const contentBlocks = markdownToNotionBlocks(section.content);
      blocks.push(...contentBlocks);
    }
  }

  return blocks;
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
    // Callout (> 💡 or > **text**)
    else if (line.trim().startsWith("> ")) {
      const content = line.trim().slice(2);
      // Check if it's a callout with emoji
      const emojiMatch = content.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}])\s*/u);
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
          type: "quote",
          quote: { rich_text: parseInlineMarkdown(content) },
        });
      }
    }
    // Checkbox / to-do
    else if (line.trim().startsWith("- ☐ ") || line.trim().startsWith("- [ ] ")) {
      const content = line.trim().replace(/^- (?:☐|\[ \]) /, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: parseInlineMarkdown(content),
          checked: false,
        },
      });
    }
    // Checked checkbox
    else if (line.trim().startsWith("- ☑ ") || line.trim().startsWith("- [x] ")) {
      const content = line.trim().replace(/^- (?:☑|\[x\]) /, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: parseInlineMarkdown(content),
          checked: true,
        },
      });
    }
    // Checkmark bullet (✅)
    else if (line.trim().startsWith("✅")) {
      const content = line.trim().slice(1).replace(/^\s*-?\s*/, "");
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: parseInlineMarkdown(content),
          checked: true,
        },
      });
    }
    // Cross bullet (⛔️)
    else if (line.trim().startsWith("⛔️") || line.trim().startsWith("⛔")) {
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
