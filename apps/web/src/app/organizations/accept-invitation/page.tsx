"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ProtectedContent,
  useSession,
} from "../../../features/auth/session-provider";

function AcceptInvitationForm() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { authenticatedRequest, adoptAccessToken } = useSession();

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await authenticatedRequest<{ accessToken: string }>(
        "/organizations/invitations/accept",
        { token },
      );
      await adoptAccessToken(result.accessToken);
      setMessage("Invitation accepted. The organization is now active.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not accept invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="accept-title">
        <Link href="/organizations" className="text-button">
          ← Organizations
        </Link>
        <p className="eyebrow">ORGANIZATION MEMBERSHIP</p>
        <h1 id="accept-title">Accept invitation</h1>
        <p>
          Sign in with the email address the invitation was sent to, then enter
          its token.
        </p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        <form className="auth-form" onSubmit={(event) => void accept(event)}>
          <label htmlFor="invitation-token">Invitation token</label>
          <input
            id="invitation-token"
            required
            minLength={32}
            maxLength={512}
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Please wait…" : "Accept invitation"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <ProtectedContent>
      <Suspense
        fallback={<main className="auth-loading">Loading invitation…</main>}
      >
        <AcceptInvitationForm />
      </Suspense>
    </ProtectedContent>
  );
}
