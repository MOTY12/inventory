"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useState } from "react";
import { useSession } from "./session-provider";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitLabel: string;
  notice?: string | null;
};

export function AuthCard({
  title,
  description,
  children,
  footer,
  onSubmit,
  submitLabel,
  notice,
}: AuthCardProps) {
  const { error } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await onSubmit(event);
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/">
        stockroom
      </Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">INVENTORY WORKSPACE</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}
        {(localError || error) && (
          <p className="auth-error" role="alert">
            {localError || error}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          {children}
          <button
            className="primary-button auth-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Please wait…" : submitLabel}
          </button>
        </form>
        {footer && <div className="auth-footer">{footer}</div>}
      </section>
      <p className="auth-legal">Secure access for your stock operations</p>
    </main>
  );
}

export function EmailField() {
  return (
    <label className="auth-field">
      Email address
      <input
        autoComplete="email"
        maxLength={320}
        name="email"
        required
        type="email"
      />
    </label>
  );
}

export function PasswordField({ confirm = false }: { confirm?: boolean }) {
  return (
    <label className="auth-field">
      {confirm ? "New password" : "Password"}
      <input
        autoComplete={confirm ? "new-password" : "current-password"}
        maxLength={128}
        minLength={12}
        name={confirm ? "password" : "password"}
        required
        type="password"
      />
      {confirm && <small>Use at least 12 characters.</small>}
    </label>
  );
}
