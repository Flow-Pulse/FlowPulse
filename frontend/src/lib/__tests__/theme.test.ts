import { describe, expect, it, beforeEach, vi } from "vitest";
import { applyTheme, getResolvedTheme, getStoredTheme } from "../theme";

describe("Theme Management", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
    };

    vi.stubGlobal("localStorage", mockStorage);
    vi.stubGlobal("window", {
      localStorage: mockStorage,
      matchMedia: (query: string) => ({
        matches: query.includes("dark"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const classSet = new Set<string>();
    vi.stubGlobal("document", {
      documentElement: {
        classList: {
          add: (...cls: string[]) => cls.forEach((c) => classSet.add(c)),
          remove: (...cls: string[]) => cls.forEach((c) => classSet.delete(c)),
          contains: (c: string) => classSet.has(c),
        },
      },
    });
  });

  it("defaults to system theme when nothing is stored", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("persists theme to localStorage and sets root class", () => {
    applyTheme("dark");
    expect(getStoredTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);

    applyTheme("light");
    expect(getStoredTheme()).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    applyTheme("system");
    expect(getStoredTheme()).toBe("system");
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("resolves dark/light when system preference is queried", () => {
    expect(getResolvedTheme("system")).toBe("dark");
    expect(getResolvedTheme("light")).toBe("light");
    expect(getResolvedTheme("dark")).toBe("dark");
  });

  it("calculates contrast ratio conforming to WCAG AA (>= 4.5:1)", () => {
    function luminance(r: number, g: number, b: number): number {
      const a = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const rgb1 = [parseInt(hex1.slice(1, 3), 16), parseInt(hex1.slice(3, 5), 16), parseInt(hex1.slice(5, 7), 16)];
      const rgb2 = [parseInt(hex2.slice(1, 3), 16), parseInt(hex2.slice(3, 5), 16), parseInt(hex2.slice(5, 7), 16)];
      const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
      const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
      const brighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (brighter + 0.05) / (darker + 0.05);
    }

    // Dark mode tokens:
    // paper background: #161b22, canvas background: #090d13
    // ink text: #f0f6fc, ink-2 text: #c9d1d9, lead text: #8b949e
    const contrastInkOnCanvas = contrastRatio("#f0f6fc", "#090d13");
    const contrastInk2OnPaper = contrastRatio("#c9d1d9", "#161b22");
    const contrastLeadOnPaper = contrastRatio("#8b949e", "#161b22");

    expect(contrastInkOnCanvas).toBeGreaterThanOrEqual(12.0);
    expect(contrastInk2OnPaper).toBeGreaterThanOrEqual(8.0);
    expect(contrastLeadOnPaper).toBeGreaterThanOrEqual(4.5);
  });
});
