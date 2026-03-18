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

    // Convert markdown plan into Notion blocks
    const blocks = markdownToNotionBlocks(plan);

    // Create a page — either in a database or as a standalone page
    const pageParams: Parameters<typeof notion.pages.create>[0] = notionDbId
      ? {
          parent: { database_id: notionDbId },
          properties: {
            title: {
              title: [{ text: { content: `Growth Plan: ${prospectCompany} — ${prospectName}` } }],
            },
          },
          children: blocks,
        }
      : {
          parent: { page_id: process.env.NOTION_PAGE_ID || "" },
          properties: {
            title: {
              title: [{ text: { content: `Growth Plan: ${prospectCompany} — ${prospectName}` } }],
            },
          },
          children: blocks,
        };

    const page = await notion.pages.create(pageParams);

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

function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.split("\n");
  const blocks: NotionBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) continue;

    // Headings
    if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: parseInlineMarkdown(line.slice(2)) },
      });
    } else if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: parseInlineMarkdown(line.slice(3)) },
      });
    } else if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: parseInlineMarkdown(line.slice(4)) },
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
    // Blockquote
    else if (line.trim().startsWith("> ")) {
      blocks.push({
        object: "block",
        type: "quote",
        quote: { rich_text: parseInlineMarkdown(line.trim().slice(2)) },
      });
    }
    // Italic line (like *Prepared by...*)
    else if (line.trim().startsWith("*") && line.trim().endsWith("*") && !line.trim().startsWith("**")) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{
            type: "text",
            text: { content: line.trim().slice(1, -1) },
            annotations: { italic: true, bold: false, strikethrough: false, underline: false, code: false, color: "default" },
          }],
        },
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

  // Notion API limits to 100 blocks per request
  return blocks.slice(0, 100);
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

  // Simple bold/italic parsing
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // Bold
      segments.push({
        type: "text",
        text: { content: match[2] },
        annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: "default" },
      });
    } else if (match[3]) {
      // Italic
      segments.push({
        type: "text",
        text: { content: match[3] },
        annotations: { bold: false, italic: true, strikethrough: false, underline: false, code: false, color: "default" },
      });
    } else if (match[4]) {
      // Code
      segments.push({
        type: "text",
        text: { content: match[4] },
        annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: true, color: "default" },
      });
    } else if (match[5]) {
      // Plain text
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
