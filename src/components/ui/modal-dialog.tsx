"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

let scrollLocks = 0;
let previousOverflow = "";
let previousBodyOverflow = "";

export function ModalDialog({
  open,
  onDismiss,
  busy = false,
  labelledBy,
  describedBy,
  initialFocusRef,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  busy?: boolean;
  labelledBy: string;
  describedBy?: string;
  initialFocusRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement;
    function syncModality() {
      // Circle owns a body-level challenge iframe. Do not make its signing UI inert
      // or move/reload it; yield the top layer until that external prompt closes.
      const challenge = document.getElementById("sdkIframe");
      const challengeVisible = challenge instanceof HTMLIFrameElement
        && challenge.getBoundingClientRect().width > 0
        && challenge.getBoundingClientRect().height > 0
        && getComputedStyle(challenge).visibility !== "hidden";
      if (challengeVisible) {
        if (dialog!.open) {
          dialog!.close();
          challenge.focus({ preventScroll: true });
        }
      } else if (!dialog!.open) {
        dialog!.showModal();
        initialFocusRef.current?.focus({ preventScroll: true });
      }
    }
    syncModality();
    const observer = new MutationObserver(syncModality);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "hidden", "width", "height"],
    });

    // Native modality makes the page inert; lock scrolling too, including stacked dialogs.
    if (scrollLocks++ === 0) {
      previousOverflow = document.documentElement.style.overflow;
      previousBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    return () => {
      observer.disconnect();
      dialog.close();
      if (--scrollLocks === 0) {
        document.documentElement.style.overflow = previousOverflow;
        document.body.style.overflow = previousBodyOverflow;
      }
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, initialFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button, input, textarea, select, [tabindex]',
        )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          initialFocusRef.current?.focus();
        } else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget && !busy) onDismiss();
        backdropPress.current = false;
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-y-auto overscroll-contain border-0 bg-transparent p-4 text-foreground backdrop:bg-black/70 backdrop:backdrop-blur-sm open:flex sm:items-center [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-accent"
    >
      {children}
    </dialog>
  );
}
