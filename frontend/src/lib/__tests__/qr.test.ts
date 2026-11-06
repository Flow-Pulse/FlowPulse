import { describe, it, expect } from "vitest";
import { encodeQr, qrToSvgPath } from "../qr";

describe("QR Code Generator", () => {
  it("encodes a basic URL into a valid QR matrix", () => {
    const url = "https://stellar.expert/explorer/testnet/tx/1234567890abcdef";
    const qr = encodeQr(url);

    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.modules.length).toBe(qr.size);
    expect(qr.modules[0].length).toBe(qr.size);

    // Verify top-left finder pattern (7x7 outer boundary has black modules)
    expect(qr.modules[0][0]).toBe(true);
    expect(qr.modules[0][6]).toBe(true);
    expect(qr.modules[6][0]).toBe(true);
    expect(qr.modules[6][6]).toBe(true);
    expect(qr.modules[1][1]).toBe(false); // inner white space
    expect(qr.modules[3][3]).toBe(true); // center black module
  });

  it("generates an SVG path string from the matrix", () => {
    const qr = encodeQr("https://flowpulse.org");
    const path = qrToSvgPath(qr);

    expect(typeof path).toBe("string");
    expect(path.startsWith("M")).toBe(true);
    expect(path).toContain("h1v1h-1z");
  });

  it("handles empty or short strings without crashing", () => {
    const qr = encodeQr("test");
    expect(qr.size).toBe(21); // Version 1 size: 17 + 4*1 = 21
  });
});
