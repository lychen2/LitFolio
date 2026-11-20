import { useRef } from "react";
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@/components/icons";
import { useT } from "@/i18n/I18nProvider";

type DetailDrawerProps = {
  onClose: () => void;
  size?: "standard" | "compact";
  actions: ReactNode;
  notification?: ReactNode;
  children: ReactNode;
} & (
  | { title: string; eyebrow: string; translatedTitle?: string | null }
  | { label: string; heading: ReactNode }
);

export function DetailDrawer(props: DetailDrawerProps) {
  const { onClose, size = "standard", actions, notification, children } = props;
  const t = useT();
  const opener = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const width = size === "compact" ? "w-[640px] max-w-[92vw]" : "w-[760px] max-w-[94vw]";

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="litera-drawer-backdrop fixed inset-0 z-[var(--z-modal-backdrop)] bg-[var(--litera-scrim)]" />
        <Dialog.Content
          aria-modal="true"
          aria-describedby={undefined}
          className={`${width} litera-drawer-enter fixed inset-y-0 right-0 z-[var(--z-modal)] flex flex-col border-l border-litera-line bg-litera-paper shadow-2xl`}
          onOpenAutoFocus={(event) => {
            const active = document.activeElement;
            opener.current = active instanceof HTMLElement ? active : null;
            if (event.currentTarget instanceof HTMLElement) {
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
          }}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && event.key === "Tab" && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
              // Radix wraps from the first control, not from the dialog itself.
              closeButton.current?.focus({ preventScroll: true });
            }
          }}
          onEscapeKeyDown={(event) => {
            if (event.isComposing || event.keyCode === 229) {
              event.preventDefault();
              return;
            }
            const active = document.activeElement;
            const disclosure = active?.closest("details[open]");
            if (disclosure instanceof HTMLDetailsElement) {
              event.preventDefault();
              disclosure.open = false;
              disclosure.querySelector("summary")?.focus();
            }
          }}
        >
          <header className="relative shrink-0 space-y-1 border-b border-litera-line py-4 pl-[var(--litera-page-inset)] pr-16">
            {"heading" in props ? (
              <>
                <Dialog.Title className="sr-only">{props.label}</Dialog.Title>
                {props.heading}
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-wider text-litera-accent2">{props.eyebrow}</p>
                <Dialog.Title className="break-words font-serif text-xl leading-tight">{props.title}</Dialog.Title>
                {props.translatedTitle && <p className="text-sm text-litera-accent">{props.translatedTitle}</p>}
              </>
            )}
            <Dialog.Close ref={closeButton} className="litera-icon-btn absolute right-4 top-4" aria-label={t("common.close")}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </header>
          {actions}
          <div className="min-h-0 flex-1 space-y-4 overflow-auto px-[var(--litera-page-inset)] py-4">{children}</div>
          {notification}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
