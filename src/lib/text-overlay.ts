import sharp from "sharp";
import path from "path";

// Headline font. Default = Montserrat Variable (free OFL, closest open-source
// match to Gilroy). Override by dropping a TTF into public/fonts/ and setting
// HEADLINE_FONT_FILE (e.g. "Gilroy-ExtraBold.ttf") in env. Don't commit
// commercial fonts — keep them in Vercel env / local-only.
const HEADLINE_FONT_FILE = process.env.HEADLINE_FONT_FILE || "Montserrat-Variable.ttf";
const HEADLINE_FONT_PATH = path.join(process.cwd(), "public/fonts", HEADLINE_FONT_FILE);

// Pango "family" name to pair with the font file. With a variable font, Pango
// reads the family from the file but we still need the descriptor string.
// HEADLINE_FONT_FAMILY can be overridden if the bundled font has a different
// internal family name (e.g. "Gilroy", "Inter").
const HEADLINE_FONT_FAMILY = process.env.HEADLINE_FONT_FAMILY || "Montserrat";

export type OverlayOptions = {
  /** The headline text to overlay */
  headline: string;
  /** Output width in pixels (default 1080 for 9:16 IG/TikTok) */
  width?: number;
  /** Output height in pixels (default 1920 for 9:16) */
  height?: number;
  /** Starting font size before auto-shrink (default 96) */
  maxFontSize?: number;
  /** Floor font size (default 56) */
  minFontSize?: number;
};

/**
 * Overlays a single-sentence headline on the top third of the image using
 * sharp's native text composite (Pango + Cairo). Far more reliable across
 * platforms than SVG <text> + librsvg, which can't load custom fonts on
 * Vercel's Linux runtime.
 *
 * Layout: dark gradient strip across the top 42%, large white ExtraBold text.
 * Designed for short, punchy single-sentence headlines (5-9 words).
 */
export async function overlayHeadline(
  imageBuffer: Buffer,
  options: OverlayOptions
): Promise<Buffer> {
  const {
    headline,
    width = 1080,
    height = 1920,
    maxFontSize = 96,
    minFontSize = 56,
  } = options;

  // 1. Resize the source image to fill the 9:16 canvas
  const baseImage = await sharp(imageBuffer)
    .resize(width, height, { fit: "cover", position: "center" })
    .toBuffer();

  // 2. Dark gradient strip across the top for legibility on any background
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

  // 3. Render the headline via sharp's native text composite (Pango)
  const textBoxWidth = Math.floor(width * 0.9);
  const textBoxHeight = Math.floor(height * 0.32);
  const fontSize = chooseFontSize(headline, maxFontSize, minFontSize, textBoxWidth);

  const textPangoMarkup = `<span foreground="white" font_weight="800">${escapePangoMarkup(headline)}</span>`;
  const shadowPangoMarkup = `<span foreground="black" font_weight="800">${escapePangoMarkup(headline)}</span>`;

  const textBuffer = await sharp({
    text: {
      text: textPangoMarkup,
      fontfile: HEADLINE_FONT_PATH,
      font: `${HEADLINE_FONT_FAMILY} ${fontSize}`,
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

  // Soft drop shadow behind the text for legibility on busy backgrounds
  const shadowBuffer = await sharp({
    text: {
      text: shadowPangoMarkup,
      fontfile: HEADLINE_FONT_PATH,
      font: `${HEADLINE_FONT_FAMILY} ${fontSize}`,
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

  // 4. Position the text in the upper area but inside Instagram's safe zone.
  // Story / Reels reserve roughly the top ~15% for the username overlay and
  // the bottom ~20% for action buttons. Starting the headline at 15% of the
  // height keeps it clear of the username bar while staying near the top.
  const textTop = Math.floor(height * 0.15);
  const textLeft = Math.floor((width - textBoxWidth) / 2);
  const shadowOffset = 5;

  // 5. Composite: base → gradient → shadow → text
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
 * Pick a font size that keeps the headline inside the text box. Targets a
 * single-line look at max size; shrinks aggressively if the headline runs
 * past two lines so it still reads as one beat of text.
 */
function chooseFontSize(
  text: string,
  maxFontSize: number,
  minFontSize: number,
  textBoxWidth: number
): number {
  // Rough chars-per-line at maxFontSize (Pango glyph width ~ 0.55 × fontSize)
  const charsPerLine = Math.max(8, Math.floor(textBoxWidth / (maxFontSize * 0.55)));
  const estimatedLines = Math.max(1, Math.ceil(text.length / charsPerLine));
  // Comfortable at 2 lines; shrink ~14pt per extra line beyond that
  const shrink = Math.max(0, estimatedLines - 2) * 14;
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
