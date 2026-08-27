import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`ui-button ui-button-${variant} ${className}`.trim()} {...props} />;
}

export function Badge({ tone = "neutral", children, className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "positive" | "warning" | "critical" | "info" }) {
  return <span className={`ui-badge ui-badge-${tone} ${className}`.trim()} {...props}>{children}</span>;
}

export function Surface({ as: Tag = "section", className = "", children, ...props }: HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div"; children: ReactNode }) {
  return <Tag className={`ui-surface ${className}`.trim()} {...props}>{children}</Tag>;
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...props} />;
}

export function SegmentedTabs({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ui-tabs" role="tablist" aria-label={label}>{children}</div>;
}

export function TabButton({ active, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button role="tab" aria-selected={active} className={`ui-tab ${active ? "is-active" : ""} ${className}`.trim()} {...props}>{children}</button>;
}

export function StatePanel({ tone = "neutral", title, children }: { tone?: "neutral" | "error" | "loading"; title: string; children?: ReactNode }) {
  return <div className={`ui-state ui-state-${tone}`} role={tone === "error" ? "alert" : "status"}><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}

export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return <div className="ui-table-wrap" role="region" aria-label={label} tabIndex={0}><table className="ui-table">{children}</table></div>;
}
