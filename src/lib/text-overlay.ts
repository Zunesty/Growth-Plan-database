import sharp from "sharp";
import path from "path";

const FONT_BOLD = path.join(process.cwd(), "public/fonts/Poppins-Bold.ttf");
const FONT_EXTRABOLD = path.join(process.cwd(), "public/fonts/Poppins-ExtraBold.ttf");

export type OverlayOptions = {
  /** The headline text to overlay */
  headline: string;
  /** Output width in pixels (default 1080 for 9:16 IG/TikTok) */
  width?: number;
  /** Output height in pixels (default 1920 for 9:16) */
  height?: number;
  /** Starting font size before auto-shrink (default 92) */
  maxFontSize?: number;
  /** Floor font size (default 56) */
  minFontSize?: number;
};

/**
 * Overlays a headline on the top third of the image using sharp's native text
 * composite (Pango + Cairo). This is far more reliable across platforms than
 * SVG <text> + librsvg, which doesn't load custom fonts on Vercel's Linux
 * runtime and renders headlines as fallback fonts or blank.
 *
 * Layout: dark gradient strip across the top 40%, white headline text in the
 * upper area so the bottle/scene below stays the visual anchor.
 */
export async function overlayHeadline(
  imageBuffer: Buffer,
  options: OverlayOptions
): Promise<Buffer> {
  const {
    headline,
    width = 1080,
    height = 1920,
    maxFontSize = 92,
    minFontSize = 56,
  } = options;

  // 1. Resize the source image to fill the 9:16 canvas
  const baseImage = await sharp(imageBuffer)
    .resize(width, height, { fit: "cover", position: "center" })
    .toBuffer();

  // 2. Build a dark gradient strip across the top 40% for readability
  const gradient = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgb(0,0,0)" stop-opacity="0.75" />
          <stop offset="60%" stop-color="rgb(0,0,0)" stop-opacity="0.45" />
          <stop offset="100%" stop-color="rgb(0,0,0)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${Math.floor(height * 0.42)}" fill="url(#fade)" />
    </svg>`
  );

  // 3. Render the headline via sharp's native text composite (uses Pango)
  const textBoxWidth = Math.floor(width * 0.88);
  const textBoxHeight = Math.floor(height * 0.28);
  const fontSize = chooseFontSize(headline, maxFontSize, minFontSize, textBoxWidth);

  const textPangoMarkup = `<span foreground="white" font_weight="800">${escapePangoMarkup(headline)}</span>`;
  const shadowPangoMarkup = `<span foreground="black" font_weight="800">${escapePangoMarkup(headline)}</span>`;

  const textBuffer = await sharp({
    text: {
      text: textPangoMarkup,
      fontfile: FONT_EXTRABOLD,
      font: `Poppins ${fontSize}`,
      width: textBoxWidth,
      height: textBoxHeight,
      align: "center",
      rgba: true,
      wrap: "word",
      spacing: -2,
    },
  })
    .png()
    .toBuffer();

  // Soft drop shadow for readability against the gradient
  const shadowBuffer = await sharp({
    text: {
      text: shadowPangoMarkup,
      fontfile: FONT_EXTRABOLD,
      font: `Poppins ${fontSize}`,
      width: textBoxWidth,
      height: textBoxHeight,
      align: "center",
      rgba: true,
      wrap: "word",
      spacing: -2,
    },
  })
    .blur(6)
    .png()
    .toBuffer();

  // 4. Position the text in the top third
  const textTop = Math.floor(height * 0.08);
  const textLeft = Math.floor((width - textBoxWidth) / 2);
  const shadowOffset = 5;

  // 5. Composite layers: base → gradient → shadow → text
  return await sharp(baseImage)
    .composite([
      { input: gradient, top: 0, left: 0 },
      {
        input: shadowBuffer,
        top: textTop + shadowOffset,
        left: textLeft + shadowOffset,
        blend: "over",
      },
      { input: textBuffer, top: textTop, left: textLeft, blend: "over" },
    ])
    .png()
    .toBuffer();
}

/**
 * Pick a font size that keeps the headline inside the text box without obvious
 * clipping. Approximation: shrink one step for every ~16 chars past the first
 * line's worth.
 */
function chooseFontSize(
  text: string,
  maxFontSize: number,
  minFontSize: number,
  textBoxWidth: number
): number {
  // Rough chars-per-line at maxFontSize (Pango glyph width ~ 0.55 × fontSize)
  const charsPerLine = Math.floor(textBoxWidth / (maxFontSize * 0.55));
  const estimatedLines = Math.max(1, Math.ceil(text.length / charsPerLine));
  // Comfortably fit ~3 lines at maxFontSize; shrink by ~10pt per extra line
  const shrink = Math.max(0, estimatedLines - 3) * 10;
  return Math.max(minFontSize, maxFontSize - shrink);
}

function escapePangoMarkup(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");
}

// Keep this export for compatibility; the bold TTF path is exposed in case
// other modules want to render text consistently with the overlay.
export const FONT_PATHS = {
  bold: FONT_BOLD,
  extraBold: FONT_EXTRABOLD,
};
