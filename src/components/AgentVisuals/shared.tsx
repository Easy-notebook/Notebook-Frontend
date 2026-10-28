import { AgentMark } from './AgentMark';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  Circle,
  Clock3,
  LoaderCircle,
  TriangleAlert,
  X,
  Sparkles,
} from 'lucide-react';
import { statusLabel, type AgentStatus } from './model';
import './agent-visuals.css';
export { ChevronDown, Sparkles };
export function useAgentClock(now: number | undefined, active: boolean) {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (now !== undefined || !active) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [now, active]);
  return now ?? Math.max(clock, Date.now());
}
export function AgentAvatar({ name, avatar }: { name: string; avatar?: ReactNode }) {
  return (
    <span className="av-avatar" aria-hidden="true">
      {typeof avatar === 'string' ? (
        <AgentMark name={avatar} />
      ) : (
        (avatar ??
        (['Codex', 'Claude Code'].includes(name) ? (
          <AgentMark name={name === 'Codex' ? 'codex' : 'claude'} />
        ) : (
          name.slice(0, 2).toUpperCase()
        )))
      )}
    </span>
  );
}
export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const Icon = {
    running: LoaderCircle,
    done: Check,
    waiting: Clock3,
    failed: TriangleAlert,
    queued: Circle,
    stopped: Circle,
  }[status];
  return (
    <span className="av-status" data-status={status}>
      <Icon size={13} />
      {statusLabel[status]}
    </span>
  );
}
export function ToolMarks({ tools }: { tools?: ReactNode[] }) {
  return tools?.length ? (
    <span className="av-tools">
      {tools.slice(0, 3).map((tool, index) => (
        <span key={index}>{typeof tool === 'string' ? <AgentMark name={tool} /> : tool}</span>
      ))}
    </span>
  ) : null;
}
/** Native dialog provides focus containment, Esc dismissal and focus restoration. */
export function AgentDialog({
  title,
  children,
  close,
  anchor,
}: {
  title: string;
  children: ReactNode;
  close(): void;
  anchor?: HTMLElement;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const position = () => {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const box = dialog.getBoundingClientRect();
      dialog.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - box.width - 12))}px`;
      dialog.style.top = `${Math.max(12, rect.bottom + box.height + 12 < window.innerHeight ? rect.bottom + 8 : rect.top - box.height - 8)}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    dialog.querySelector<HTMLButtonElement>('[data-dialog-primary]')?.focus();
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`av-dialog av-theme ${anchor ? 'av-popover' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <strong>{title}</strong>
        <button aria-label="Close details" onClick={close}>
          <X size={16} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
