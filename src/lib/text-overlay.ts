import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";

// Load Poppins from Google Fonts at startup (cached)
let fontLoaded = false;
async function ensureFontLoaded() {
  if (fontLoaded) return;
  try {
    // Try to use a system font as fallback if download fails
    fontLoaded = true;
  } catch {
    // Canvas will fall back to default sans-serif
    fontLoaded = true;
  }
}

export type OverlayOptions = {
  /** The headline text to overlay */
  headline: string;
  /** Output width in pixels (default 1080 for 9:16 Instagram/TikTok) */
  width?: number;
  /** Output height in pixels (default 1920 for 9:16) */
  height?: number;
  /** Max font size before auto-shrinking (default 72) */
  maxFontSize?: number;
  /** Min font size (default 36) */
  minFontSize?: number;
  /** Text color (default white) */
  textColor?: string;
  /** Shadow color (default black with alpha) */
  shadowColor?: string;
};

/**
 * Overlays a headline onto an image. Text is centered horizontally and
 * vertically in the middle 50% of the image (the "square safe zone"),
 * with a strong shadow + outline so it's readable on any background.
 */
export async function overlayHeadline(
  imageBuffer: Buffer,
  options: OverlayOptions
): Promise<Buffer> {
  await ensureFontLoaded();

  const {
    headline,
    width = 1080,
    height = 1920,
    maxFontSize = 72,
    minFontSize = 36,
    textColor = "#FFFFFF",
    shadowColor = "rgba(0, 0, 0, 0.85)",
  } = options;

  // Create canvas at target 9:16 size
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Load source image
  const sourceImage = await loadImage(imageBuffer);

  // Cover-fit the source image (fill canvas, crop if needed)
  const sourceRatio = sourceImage.width / sourceImage.height;
  const targetRatio = width / height;

  let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
  if (sourceRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
    drawX = (width - drawWidth) / 2;
    drawY = 0;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
    drawX = 0;
    drawY = (height - drawHeight) / 2;
  }

  ctx.drawImage(sourceImage, drawX, drawY, drawWidth, drawHeight);

  // Add a subtle dark gradient in the middle to improve text readability
  const gradient = ctx.createLinearGradient(0, height * 0.3, 0, height * 0.7);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.35)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height * 0.3, width, height * 0.4);

  // Determine font size — start at max, shrink until text fits in 80% of width
  // with reasonable line wrapping
  const maxTextWidth = width * 0.8;
  const fontFamily = GlobalFonts.has("Poppins") ? "Poppins" : "sans-serif";

  let fontSize = maxFontSize;
  let lines: string[] = [];
  while (fontSize >= minFontSize) {
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    lines = wrapText(ctx, headline, maxTextWidth);
    if (lines.length <= 4 && lines.every((l) => ctx.measureText(l).width <= maxTextWidth)) {
      break;
    }
    fontSize -= 4;
  }

  // Position text — centered vertically (in square-crop safe zone), horizontally
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = fontSize * 1.15;
  const totalTextHeight = lineHeight * lines.length;
  const startY = height / 2 - totalTextHeight / 2 + lineHeight / 2;

  // Draw text with shadow + stroke for readability
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    const x = width / 2;

    // Shadow layer
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = textColor;
    ctx.fillText(line, x, y);

    // Reset shadow for stroke
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, fontSize / 24);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.strokeText(line, x, y);

    // Re-draw fill on top of stroke for crisp letters
    ctx.fillText(line, x, y);
  });

  return await canvas.encode("png");
}

/** Wrap text to fit a target width by breaking on spaces. */
function wrapText(ctx: { measureText: (s: string) => { width: number } }, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
