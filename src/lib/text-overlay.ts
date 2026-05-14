import sharp from "sharp";

export type OverlayOptions = {
  /** The headline text to overlay */
  headline: string;
  /** Output width in pixels (default 1080 for 9:16 Instagram/TikTok) */
  width?: number;
  /** Output height in pixels (default 1920 for 9:16) */
  height?: number;
  /** Max font size before auto-shrinking (default 84) */
  maxFontSize?: number;
  /** Min font size (default 44) */
  minFontSize?: number;
  /** Text color (default white) */
  textColor?: string;
};

/**
 * Overlays a headline onto an image using sharp + SVG.
 * Text is centered horizontally and vertically (in the middle of the image
 * for square-crop safety) with a strong shadow + outline for readability.
 */
export async function overlayHeadline(
  imageBuffer: Buffer,
  options: OverlayOptions
): Promise<Buffer> {
  const {
    headline,
    width = 1080,
    height = 1920,
    maxFontSize = 84,
    minFontSize = 44,
    textColor = "#FFFFFF",
  } = options;

  // 1. Resize the source image to fill the 9:16 canvas (cover-fit, crop overflow)
  const baseImage = await sharp(imageBuffer)
    .resize(width, height, { fit: "cover", position: "center" })
    .toBuffer();

  // 2. Build the text overlay as an SVG (sharp composites SVGs natively)
  const lines = wrapText(headline, maxFontSize);

  // Auto-shrink font size if too many lines
  let fontSize = maxFontSize;
  let displayLines = lines;
  if (lines.length > 4) {
    fontSize = Math.max(minFontSize, maxFontSize - (lines.length - 4) * 8);
    displayLines = wrapText(headline, fontSize);
  }

  const lineHeight = fontSize * 1.15;
  const totalTextHeight = lineHeight * displayLines.length;
  const startY = height / 2 - totalTextHeight / 2 + fontSize / 2;

  // SVG with gradient background behind text + shadow + stroke for readability
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="readabilityFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)" />
        <stop offset="50%" stop-color="rgba(0,0,0,0.35)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0)" />
      </linearGradient>
      <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="black" flood-opacity="0.85"/>
      </filter>
    </defs>
    <rect x="0" y="${height * 0.3}" width="${width}" height="${height * 0.4}" fill="url(#readabilityFade)" />
    <g font-family="Poppins, Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}" text-anchor="middle" filter="url(#textShadow)">
      ${displayLines
        .map(
          (line, i) =>
            `<text x="${width / 2}" y="${startY + i * lineHeight}" fill="${textColor}" stroke="rgba(0,0,0,0.5)" stroke-width="${Math.max(2, fontSize / 24)}" paint-order="stroke fill">${escapeXml(line)}</text>`
        )
        .join("\n")}
    </g>
  </svg>`;

  // 3. Composite SVG onto the image
  return await sharp(baseImage)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Wrap text into lines that fit within the canvas (rough heuristic by char count). */
function wrapText(text: string, fontSize: number): string[] {
  // Roughly: at fontSize=84 on 1080px wide, ~16 chars fits per line in 80% of width
  const charsPerLine = Math.floor((1080 * 0.8) / (fontSize * 0.55));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length <= charsPerLine) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Escape XML special characters for safe SVG embedding. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
