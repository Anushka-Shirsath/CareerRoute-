"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Compass,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Layers,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  ExternalLink,
  BookOpen,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  RefreshCw,
  Send,
  Scale,
  Info,
  LoaderCircle,
  Route,
  MoveUpRight,
  type LucideIcon,
} from "lucide-react";
import { api, errorText } from "./api";
import {
  money,
  pretty,
  route,
  eligibilityLabels,
  cutoffLabels,
} from "./content";
import { useWorkspace } from "./context";
import type { Offering, Ranked, Source } from "./types";

const icons: Record<string, LucideIcon> = {
  arrow: ArrowRight,
  up: ArrowUpRight,
  back: ArrowLeft,
  bookmark: Bookmark,
  check: Check,
  checks: CheckCheck,
  down: ChevronDown,
  right: ChevronRight,
  compass: Compass,
  file: FileText,
  graduate: GraduationCap,
  heart: Heart,
  home: Home,
  layers: Layers,
  pin: MapPin,
  menu: Menu,
  chat: MessageCircle,
  plus: Plus,
  search: Search,
  settings: Settings2,
  shield: ShieldCheck,
  sliders: SlidersHorizontal,
  spark: Sparkles,
  trash: Trash2,
  upload: Upload,
  close: X,
  external: ExternalLink,
  book: BookOpen,
  done: CheckCircle2,
  circle: Circle,
  copy: Copy,
  download: Download,
  refresh: RefreshCw,
  send: Send,
  scale: Scale,
  info: Info,
  loading: LoaderCircle,
  route: Route,
  move: MoveUpRight,
};
export function Icon({
  name,
  size = 18,
  className = "",
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
} & React.SVGProps<SVGSVGElement>) {
  const Component = icons[name] || Info;
  return (
    <Component
      aria-hidden="true"
      size={size}
      strokeWidth={1.65}
      className={className}
      {...props}
    />
  );
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/"
      className={"brand " + (small ? "brand-small" : "")}
      aria-label="CareerQuest home"
    >
      <svg aria-hidden="true" viewBox="0 0 40 40" fill="none">
        <circle
          cx="18"
          cy="18"
          r="13"
          stroke="currentColor"
          strokeWidth="2.3"
        />
        <path d="m23 12-2.5 8.5L12 23l2.5-8.5Z" fill="currentColor" />
        <path
          d="m28 28 7 7"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span>CareerQuest</span>
    </Link>
  );
}
export function Button({
  children,
  variant = "primary",
  busy = false,
  icon,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text" | "danger";
  busy?: boolean;
  icon?: string;
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? (
        <Icon name="loading" className="spin" />
      ) : icon ? (
        <Icon name={icon} />
      ) : null}
      {children}
    </button>
  );
}
export function ActionLink({
  href,
  children,
  icon = "arrow",
  variant = "secondary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  icon?: string;
  variant?: string;
  className?: string;
}) {
  return (
    <Link className={`button ${variant} ${className}`} href={href}>
      {children}
      {icon && <Icon name={icon} size={16} />}
    </Link>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="text-link">
      {children}
      <Icon name="up" size={15} />
    </Link>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="header-actions">{action}</div>}
    </header>
  );
}
export function Panel({
  title,
  children,
  action,
  className = "",
  id,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning";
}) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
export function Notice({
  children,
  icon = "info",
  className = "",
}: {
  children: ReactNode;
  icon?: string;
  className?: string;
}) {
  return (
    <div className={`notice ${className}`}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="inline-error" role="alert">
      <Icon name="info" />
      <div>
        <p>{message}</p>
        {retry && (
          <button className="text-link" onClick={retry}>
            Try again <Icon name="refresh" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div className="loading-state" role="status" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function CheckField({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      <button
        className="toggle"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
const sources = new Map<string, Promise<Source>>();
export function SourceLink({
  id,
  source,
  label = "View source",
}: {
  id?: string | null;
  source?: Source;
  label?: string;
}) {
  const [item, setItem] = useState<Source | undefined>(source);
  useEffect(() => {
    if (source) {
      setItem(source);
      return;
    }
    if (!id) return;
    let live = true;
    if (!sources.has(id))
      sources.set(id, api<Source>("/sources/" + encodeURIComponent(id)));
    sources
      .get(id)!
      .then((s) => {
        if (live) setItem(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, source]);
  if (!id && !source) return <span className="muted">Source not verified</span>;
  return item ? (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="source-link"
      title={item.publisher || label}
    >
      {label}
      <Icon name="external" size={13} />
    </a>
  ) : (
    <span className="muted">Loading source…</span>
  );
}
export function SourceYear({ offering }: { offering: Offering }) {
  return (
    <div className="source-year">
      <span>
        <Icon name="shield" size={13} />
        {offering.is_synthetic
          ? "Demo data"
          : offering.academic_year
            ? "Official source"
            : "Year not provided"}
        {offering.academic_year && ` · ${offering.academic_year}`}
      </span>
      <SourceLink id={offering.source_id} />
    </div>
  );
}
export function CollegeRow({
  offering,
  match,
  compact = false,
}: {
  offering: Offering;
  match?: Ranked;
  compact?: boolean;
}) {
  const ws = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saved = ws.isSaved(offering.id);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await ws.saveOffering(offering);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`college-row ${compact ? "compact" : ""}`}>
      <div className="college-main">
        <div className="college-title-line">
          <p className="college-name">
            <Link href={"/colleges/" + encodeURIComponent(offering.id)}>
              {offering.name}
            </Link>
          </p>
          <button
            className={`icon-button ${saved ? "is-saved" : ""}`}
            aria-label={`${saved ? "Remove" : "Save"} ${offering.name}`}
            onClick={save}
            disabled={busy}
          >
            <Icon
              name={busy ? "loading" : "bookmark"}
              className={busy ? "spin" : ""}
            />
          </button>
        </div>
        <h3>{offering.program_name}</h3>
        <div className="college-meta">
          <span>
            <Icon name="pin" size={14} />
            {offering.district || "District not provided"}
          </span>
          <span>{pretty(offering.management || "unknown")}</span>
          <span>{offering.medium || "Medium not verified"}</span>
        </div>
        {!compact && (
          <div className="college-facts">
            <span>
              <span className="muted">{offering.published_fee ? `Published annual fee · ${offering.published_fee.academic_year}` : "Tuition / year"}</span>
              <strong>{money(offering.published_fee?.amount ?? offering.tuition)}</strong>
            </span>
            <span>
              <span className="muted">Hostel</span>
              <strong>
                {offering.hostel_status === "available"
                  ? "Available"
                  : offering.hostel_status === "not_available"
                    ? "Not available"
                    : "Not verified"}
              </strong>
            </span>
            {match && (
              <span>
                <span className="muted">Preference evidence</span>
                <strong>
                  {Math.round(match.evidence_coverage * 100)}% measured
                </strong>
              </span>
            )}
          </div>
        )}
        {match && (
          <div className="match-axes">
            <span>{eligibilityLabels[match.eligibility_status]}</span>
            <span>{cutoffLabels[match.cutoff_comparison.status]}</span>
            <span>Preference rank is not an admission prediction</span>
          </div>
        )}
        <SourceYear offering={offering} />
        {error && <ErrorState message={error} />}
      </div>
      {!compact && (
        <div className="college-actions">
          <Link
            className="text-link"
            href={"/colleges/" + encodeURIComponent(offering.id)}
          >
            View details <Icon name="up" size={15} />
          </Link>
          <button
            className="text-link"
            onClick={() => ws.toggleCompare(offering.id)}
          >
            {ws.compareIds.includes(offering.id)
              ? "Remove from compare"
              : "Compare"}
            <Icon
              name={ws.compareIds.includes(offering.id) ? "check" : "plus"}
              size={15}
            />
          </button>
        </div>
      )}
    </article>
  );
}
export function CompareTray() {
  const ws = useWorkspace();
  if (!ws.compareIds.length) return null;
  return (
    <aside
      className="compare-tray"
      aria-label="Offerings selected for comparison"
    >
      <div>
        <Icon name="scale" />
        <span>
          <strong>
            {ws.compareIds.length} offering{ws.compareIds.length > 1 ? "s" : ""}
          </strong>{" "}
          selected for comparison
        </span>
      </div>
      <div>
        <button
          className="text-link"
          onClick={() => ws.compareIds.forEach((id) => ws.toggleCompare(id))}
        >
          Clear
        </button>
        <ActionLink href="/compare" variant="primary">
          Compare costs
        </ActionLink>
      </div>
    </aside>
  );
}
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]');
        if (!controls?.length) { event.preventDefault(); return; }
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy, onClose]);
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <h2 id="dialog-title">{title}</h2>
        <p>{description}</p>
        {error && <ErrorState message={error} />}
        <div className="actions">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={busy}
            autoFocus
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
