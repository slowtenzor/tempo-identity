/**
 * Drunken Bishop visual fingerprint generator
 * Based on the algorithm from OpenSSH's key randomart (Bishop Peter)
 *
 * Input:  hex string (address, hash, etc.)
 * Output: 2D grid of "visit counts" — render as heatmap, ASCII, or pixel art
 *
 * Grid is square (default 11×11) instead of SSH's 17×9
 */

export interface BishopOptions {
  /** Grid size (square). Default: 11 */
  size?: number;
  /** Hex input to walk. If shorter than needed, it cycles. */
  hex: string;
}

export interface BishopResult {
  /** 2D array [row][col] of visit counts */
  grid: number[][];
  /** Max visit count (for normalization) */
  maxVal: number;
  /** Grid size */
  size: number;
}

/**
 * Run the drunken bishop walk on a square grid.
 * Each byte of input drives 4 steps (2 bits each).
 */
export function drunkenBishop(opts: BishopOptions): BishopResult {
  const size = opts.size ?? 11;
  const hex = opts.hex.replace(/^0x/i, "").toLowerCase();

  // Init grid
  const grid: number[][] = Array.from({ length: size }, () =>
    new Array(size).fill(0)
  );

  // Start in center
  let x = Math.floor(size / 2);
  let y = Math.floor(size / 2);

  // Parse hex into bytes
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  // Walk
  for (const byte of bytes) {
    for (let shift = 0; shift < 8; shift += 2) {
      const direction = (byte >> shift) & 0x03;
      //  0 = up-left,  1 = up-right
      //  2 = down-left, 3 = down-right
      const dy = direction < 2 ? -1 : 1;
      const dx = direction % 2 === 0 ? -1 : 1;

      x = Math.max(0, Math.min(size - 1, x + dx));
      y = Math.max(0, Math.min(size - 1, y + dy));

      grid[y][x]++;
    }
  }

  const maxVal = Math.max(...grid.flat());
  return { grid, maxVal, size };
}

// ─── ASCII renderer (classic SSH style) ───

const SSH_CHARS = " .o+=*BOX@%&#/^SE";

export function toAscii(result: BishopResult): string {
  const { grid, size } = result;
  const top = "+" + "-".repeat(size) + "+";
  const lines = [top];
  for (const row of grid) {
    const chars = row.map((v) => SSH_CHARS[Math.min(v, SSH_CHARS.length - 1)]);
    lines.push("|" + chars.join("") + "|");
  }
  lines.push(top);
  return lines.join("\n");
}

// ─── SVG renderer (pixel heatmap, square cells) ───

export interface SvgOptions {
  /** Total SVG width/height in px. Default: 110 */
  svgSize?: number;
  /** Color palette: array of CSS colors from cold→hot */
  palette?: string[];
}

const DEFAULT_PALETTE = [
  "#0d1117", // 0  — background (dark)
  "#161b22", // 1
  "#1a3a2a", // 2
  "#1f6b3a", // 3
  "#2ea043", // 4
  "#3fb950", // 5
  "#56d364", // 6
  "#7ee787", // 7
  "#aff5b4", // 8
  "#dafbe1", // 9+
];

export function toSvg(result: BishopResult, opts?: SvgOptions): string {
  const svgSize = opts?.svgSize ?? 110;
  const palette = opts?.palette ?? DEFAULT_PALETTE;
  const { grid, maxVal, size } = result;
  const cell = svgSize / size;

  let rects = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = grid[y][x];
      const idx =
        maxVal === 0 ? 0 : Math.round((v / maxVal) * (palette.length - 1));
      const color = palette[idx];
      rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${color}"/>`;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">`,
    rects,
    `</svg>`,
  ].join("");
}

// ─── React component (optional, for Next.js / React projects) ───

export function bishopSvgDataUri(hex: string, size = 11, svgSize = 110): string {
  const result = drunkenBishop({ hex, size });
  const svg = toSvg(result, { svgSize });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ─── Demo / CLI ───

if (typeof process !== "undefined" && process.argv[1]?.includes("drunken-bishop")) {
  const input = process.argv[2] ?? "0xBcd3202E8DaFbE56522354922912747eC2bF3077";
  console.log(`\nInput: ${input}\n`);

  const result = drunkenBishop({ hex: input, size: 11 });
  console.log("ASCII (11×11):\n");
  console.log(toAscii(result));

  const result17 = drunkenBishop({ hex: input, size: 17 });
  console.log("\nASCII (17×17):\n");
  console.log(toAscii(result17));

  console.log("\nSVG written to stdout with --svg flag");
}
