import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';

export function useDialogKeyboard(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") {
      // Give an open disclosure first use of Escape.
      const disclosure = event.target instanceof Element && event.target.closest("details[open]");
      event.preventDefault();
      event.stopPropagation();
      if (disclosure instanceof HTMLDetailsElement) {
        disclosure.open = false;
        disclosure.querySelector("summary")?.focus();
      } else {
        onClose();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((control) => control.tabIndex >= 0 && !control.matches(":disabled") && control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    const active = document.activeElement;
    const atBoundary = event.shiftKey ? active === first || active === dialog : active === last;
    if (!first || atBoundary) {
      event.preventDefault();
      (event.shiftKey ? last ?? dialog : first ?? dialog).focus();
    }
  }

  return { ref, onKeyDown, tabIndex: -1, role: "dialog", "aria-modal": true } as const;
}
