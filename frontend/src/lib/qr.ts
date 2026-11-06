/**
 * Lightweight, zero-dependency QR Code (Model 2) SVG generator.
 * Implements Byte mode with standard Reed-Solomon error correction (Level M/L).
 */

// Galois Field GF(256) tables with primitive polynomial 0x11d (285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

// Generator polynomials for Reed-Solomon codes
function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP_TABLE[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLength);
  const res = new Uint8Array(ecLength);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.copyWithin(0, 1);
    res[ecLength - 1] = 0;
    for (let i = 0; i < ecLength; i++) {
      res[i] ^= gfMul(gen[i], factor);
    }
  }
  return res;
}

// Version table capacities for Byte Mode (Level L)
// Version 1..10 capacities and EC parameters
interface QrVersionSpec {
  version: number;
  totalCodewords: number;
  ecCodewords: number;
  dataCodewords: number;
  blocks: number;
  alignment: number[];
}

const VERSION_SPECS: QrVersionSpec[] = [
  { version: 1, totalCodewords: 26, ecCodewords: 7, dataCodewords: 19, blocks: 1, alignment: [] },
  { version: 2, totalCodewords: 44, ecCodewords: 10, dataCodewords: 34, blocks: 1, alignment: [6, 18] },
  { version: 3, totalCodewords: 70, ecCodewords: 15, dataCodewords: 55, blocks: 1, alignment: [6, 22] },
  { version: 4, totalCodewords: 100, ecCodewords: 20, dataCodewords: 80, blocks: 1, alignment: [6, 26] },
  { version: 5, totalCodewords: 134, ecCodewords: 26, dataCodewords: 108, blocks: 1, alignment: [6, 30] },
  { version: 6, totalCodewords: 172, ecCodewords: 36, dataCodewords: 136, blocks: 2, alignment: [6, 34] },
  { version: 7, totalCodewords: 196, ecCodewords: 40, dataCodewords: 156, blocks: 2, alignment: [6, 22, 38] },
  { version: 8, totalCodewords: 242, ecCodewords: 48, dataCodewords: 194, blocks: 2, alignment: [6, 24, 42] },
  { version: 9, totalCodewords: 292, ecCodewords: 60, dataCodewords: 232, blocks: 2, alignment: [6, 26, 46] },
  { version: 10, totalCodewords: 346, ecCodewords: 72, dataCodewords: 274, blocks: 4, alignment: [6, 28, 50] },
];

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

/**
 * Encodes text into a QR code boolean matrix (Version 1-10, EC Level L).
 */
export function encodeQr(text: string): QrMatrix {
  const utf8 = new TextEncoder().encode(text);
  const len = utf8.length;

  // Find lowest suitable version
  const spec = VERSION_SPECS.find((s) => s.dataCodewords >= len + 3);
  if (!spec) {
    throw new Error(`Text too long for supported QR versions (max ~270 bytes)`);
  }

  // 1. Bitstream assembly: Mode indicator (0100 for Byte mode) + character count + data
  const bits: number[] = [];
  function pushBits(val: number, count: number) {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(len, spec.version < 10 ? 8 : 16); // Character count indicator
  for (const byte of utf8) {
    pushBits(byte, 8);
  }

  // Terminator (up to 4 zeroes)
  const maxBits = spec.dataCodewords * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  pushBits(0, termLen);

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Pad bytes (0xEC, 0x11 alternating)
  const dataBytes = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    dataBytes[i] = b;
  }

  const pad = [0xec, 0x11];
  let padIdx = 0;
  for (let i = bits.length / 8; i < spec.dataCodewords; i++) {
    dataBytes[i] = pad[padIdx % 2];
    padIdx++;
  }

  // 2. Reed-Solomon Error Correction
  const ecLengthPerBlock = Math.floor(spec.ecCodewords / spec.blocks);
  const dataLengthPerBlock = Math.floor(spec.dataCodewords / spec.blocks);
  const allEcBlocks: Uint8Array[] = [];
  const allDataBlocks: Uint8Array[] = [];

  for (let b = 0; b < spec.blocks; b++) {
    const start = b * dataLengthPerBlock;
    const blockData = dataBytes.slice(start, start + dataLengthPerBlock);
    allDataBlocks.push(blockData);
    allEcBlocks.push(rsComputeRemainder(blockData, ecLengthPerBlock));
  }

  // Interleave data and EC codewords
  const finalCodewords: number[] = [];
  for (let i = 0; i < dataLengthPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      finalCodewords.push(allDataBlocks[b][i]);
    }
  }
  for (let i = 0; i < ecLengthPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      finalCodewords.push(allEcBlocks[b][i]);
    }
  }

  // 3. Matrix construction
  const size = 17 + 4 * spec.version;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunctionModule(r: number, c: number, val: boolean) {
    matrix[r][c] = val;
    isFunction[r][c] = true;
  }

  // Finder patterns at (0,0), (size-7, 0), (0, size-7)
  function drawFinderPattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const isBlack =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setFunctionModule(nr, nc, isBlack);
      }
    }
  }

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // Alignment patterns for version >= 2
  const coords = spec.alignment;
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      const r = coords[i];
      const c = coords[j];
      if (isFunction[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBlack = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(r + dr, c + dc, isBlack);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setFunctionModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setFunctionModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setFunctionModule(4 * spec.version + 9, 8, true);

  // Format info reserve
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
  }

  // 4. Place data bits with Mask 0 ((row + col) % 2 === 0)
  const bitArray: number[] = [];
  for (const byte of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      bitArray.push((byte >>> i) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < bitArray.length ? bitArray[bitIdx++] : 0;
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1;
        }
      }
    }
    upwards = !upwards;
  }

  // 5. Write Format Information (Level L, Mask 0: bits 111011111000100)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i] === 1;

  return { size, modules: matrix };
}

/**
 * Generates an SVG path data string for rendering the QR matrix cleanly.
 */
export function qrToSvgPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  const { size, modules } = matrix;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        parts.push(`M${c},${r}h1v1h-1z`);
      }
    }
  }
  return parts.join("");
}
