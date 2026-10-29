import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError, isConflict } from "@/lib/api";

export function Modal({
  open,
  title,
  description,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className="app-dialog" onClose={onClose} onCancel={onClose}>
      {open && (
        <div>
          <div className="dialog-head">
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {children && <div className="dialog-body">{children}</div>}
          <div className="dialog-actions">{actions}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={"btn " + (danger ? "btn-danger" : "btn-primary")} onClick={onConfirm} disabled={busy}>
            {busy ? "Salvando…" : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/** Runs a server action once at a time; success only after the server confirms. */
export function useAction() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    try {
      const result = await fn();
      await queryClient.invalidateQueries();
      if (success) toast.success(success);
      return result;
    } catch (error) {
      toast.error(friendlyError(error));
      if (isConflict(error)) await queryClient.invalidateQueries();
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" /> {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="card court-empty" role="alert">
      <div className="empty-icon">!</div>
      <h2>Não foi possível carregar</h2>
      <p>{friendlyError(error)}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function PageHead({ kicker, title, text, children }: { kicker: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {children}
    </div>
  );
}

export const initials = (name: string) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();

export const dateTime = (v: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
export const dateOnly = (v: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(v));
export const statusLabel = (s: string) => (s === "active" ? "ATIVO" : s === "paused" ? "PAUSADO" : "ENCERRADO");
