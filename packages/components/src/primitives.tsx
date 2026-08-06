import type { LucideIcon } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

const classes = (...values: Array<string | false | null | undefined>): string =>
  values.filter(Boolean).join(" ");

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "primary" | "secondary" | "danger" | "quiet";
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ tone = "primary", icon: Icon, className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={classes("sy-button", `sy-button--${tone}`, className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={17} strokeWidth={1.8} /> : null}
      <span>{children}</span>
    </button>
  ),
);
Button.displayName = "Button";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon: LucideIcon;
  tone?: "default" | "danger";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon: Icon, tone = "default", className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={classes(
        "sy-icon-button",
        `sy-icon-button--${tone}`,
        className,
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
    </button>
  ),
);
IconButton.displayName = "IconButton";

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="sy-field">
      <span className="sy-field__label">{label}</span>
      {children}
      {error ? <span className="sy-field__error">{error}</span> : null}
      {!error && hint ? <span className="sy-field__hint">{hint}</span> : null}
    </label>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={classes("sy-input", className)} {...props} />
));
TextInput.displayName = "TextInput";

export interface ToggleProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "checked" | "children" | "onChange" | "type"
  > {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ checked, className, label, onCheckedChange, ...props }, ref) => (
    <label className={classes("sy-toggle", className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        {...props}
      />
      <span className="sy-toggle__track" aria-hidden="true">
        <span className="sy-toggle__thumb" />
      </span>
      <span className="sy-toggle__label">{label}</span>
    </label>
  ),
);
Toggle.displayName = "Toggle";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={classes("sy-input", "sy-select", className)}
    {...props}
  />
));
Select.displayName = "Select";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="sy-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="sy-segmented__option"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className="sy-progress" aria-label={label}>
      <div className="sy-progress__track">
        <div className="sy-progress__value" style={{ width: `${bounded}%` }} />
      </div>
      <span>{Math.round(bounded)}%</span>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger" | "info";
}) {
  return <span className={`sy-status sy-status--${tone}`}>{children}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="sy-empty">
      <Icon aria-hidden="true" size={24} />
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sy-page-header">
      <div>
        {eyebrow ? (
          <span className="sy-page-header__eyebrow">{eyebrow}</span>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? (
        <div className="sy-page-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}

export function Section({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={classes("sy-section", className)} {...props} />;
}

export function DataList({
  rows,
}: {
  rows: Array<{
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    action?: ReactNode;
  }>;
}) {
  return (
    <div className="sy-data-list">
      {rows.map((row) => (
        <div className="sy-data-list__row" key={row.label}>
          <div>
            <span className="sy-data-list__label">{row.label}</span>
            {row.detail ? <small>{row.detail}</small> : null}
          </div>
          <div className="sy-data-list__value">{row.value}</div>
          {row.action ? (
            <div className="sy-data-list__action">{row.action}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
