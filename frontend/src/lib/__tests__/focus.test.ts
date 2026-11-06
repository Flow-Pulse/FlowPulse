import { describe, it, expect, vi } from "vitest";
import { handleFocusTrap } from "../focus";

describe("handleFocusTrap", () => {
  function createMockContainer(elements: { tag: string; id: string; disabled?: boolean }[]) {
    const container = {
      contains: vi.fn((el) => elements.some((e) => e.id === el?.id)),
      querySelectorAll: vi.fn((_selector: string) => {
        return elements.map((item) => ({
          id: item.id,
          tagName: item.tag.toUpperCase(),
          focus: vi.fn(),
          getAttribute: vi.fn((attr: string) => (attr === "disabled" && item.disabled ? "" : null)),
          style: {},
        }));
      }),
    } as unknown as HTMLElement;
    return container;
  }

  it("ignores non-Tab key events", () => {
    const container = createMockContainer([{ tag: "button", id: "btn1" }]);
    const preventDefault = vi.fn();
    const handled = handleFocusTrap({
      container,
      event: { key: "Enter", shiftKey: false, preventDefault },
      activeElement: null,
    });

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("wraps from last to first on Tab", () => {
    const elements = [
      { id: "close-btn", tagName: "BUTTON", focus: vi.fn(), style: {} },
      { id: "save-btn", tagName: "BUTTON", focus: vi.fn(), style: {} },
    ];
    const container = {
      contains: vi.fn(() => true),
      querySelectorAll: vi.fn(() => elements),
    } as unknown as HTMLElement;

    const preventDefault = vi.fn();
    const handled = handleFocusTrap({
      container,
      event: { key: "Tab", shiftKey: false, preventDefault },
      activeElement: elements[1] as any, // Last element
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(elements[0].focus).toHaveBeenCalled();
  });

  it("wraps from first to last on Shift+Tab", () => {
    const elements = [
      { id: "close-btn", tagName: "BUTTON", focus: vi.fn(), style: {} },
      { id: "save-btn", tagName: "BUTTON", focus: vi.fn(), style: {} },
    ];
    const container = {
      contains: vi.fn(() => true),
      querySelectorAll: vi.fn(() => elements),
    } as unknown as HTMLElement;

    const preventDefault = vi.fn();
    const handled = handleFocusTrap({
      container,
      event: { key: "Tab", shiftKey: true, preventDefault },
      activeElement: elements[0] as any, // First element
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(elements[1].focus).toHaveBeenCalled();
  });

  it("focuses first element if focus is outside container on Tab", () => {
    const elements = [
      { id: "close-btn", tagName: "BUTTON", focus: vi.fn(), style: {} },
      { id: "save-btn", tagName: "BUTTON", focus: vi.fn(), style: {} },
    ];
    const container = {
      contains: vi.fn(() => false),
      querySelectorAll: vi.fn(() => elements),
    } as unknown as HTMLElement;

    const preventDefault = vi.fn();
    const handled = handleFocusTrap({
      container,
      event: { key: "Tab", shiftKey: false, preventDefault },
      activeElement: { id: "outside" } as any,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(elements[0].focus).toHaveBeenCalled();
  });

  it("prevents default if no focusable elements are present", () => {
    const container = {
      contains: vi.fn(() => true),
      querySelectorAll: vi.fn(() => []),
    } as unknown as HTMLElement;

    const preventDefault = vi.fn();
    const handled = handleFocusTrap({
      container,
      event: { key: "Tab", shiftKey: false, preventDefault },
      activeElement: null,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });
});
