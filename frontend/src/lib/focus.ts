export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FocusTrapOptions {
  container: HTMLElement;
  event: { key: string; shiftKey: boolean; preventDefault: () => void };
  activeElement: Element | null;
}

/**
 * Handles Tab and Shift+Tab key navigation to keep focus trapped within the container.
 * Returns true if the event was handled (trapped) and default prevented.
 */
export function handleFocusTrap({
  container,
  event,
  activeElement,
}: FocusTrapOptions): boolean {
  if (event.key !== "Tab") return false;

  const focusables = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => {
    // In JSDOM / headless, offsetParent might be null, so check display/visibility if needed
    const style = (el as any).style;
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    return true;
  });

  if (focusables.length === 0) {
    event.preventDefault();
    return true;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey) {
    if (activeElement === first || !container.contains(activeElement)) {
      event.preventDefault();
      last.focus();
      return true;
    }
  } else {
    if (activeElement === last || !container.contains(activeElement)) {
      event.preventDefault();
      first.focus();
      return true;
    }
  }

  return false;
}
