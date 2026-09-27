"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Ask = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: IconName;
};

const Ctx = createContext<(ask: Ask) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) …` — a bottom sheet in the thumb zone. */
export function useConfirm() {
  return useContext(Ctx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((a: Ask) => {
    resolver.current?.(false);
    setAsk(a);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setAsk(null);
  };

  useEffect(() => {
    if (!ask) return;
    const prev = document.activeElement as HTMLElement | null;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && answer(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {ask && (
        <div className="sheet-backdrop" onClick={() => answer(false)}>
          <div className="sheet confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <span className="grabber" aria-hidden="true" />
            <h2 id="confirm-title">{ask.title}</h2>
            {ask.body && <p className="muted" style={{ margin: "0 0 4px" }}>{ask.body}</p>}
            <button ref={confirmBtn} type="button" className={`btn btn-block ${ask.danger ? "btn-destroy" : "btn-primary"}`} onClick={() => answer(true)}>
              {ask.icon && <Icon name={ask.icon} size={20} />} {ask.confirmLabel}
            </button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => answer(false)}>
              {ask.cancelLabel ?? "Cancel"}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
