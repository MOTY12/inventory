"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";

type Membership = {
  role: string;
  organization: { id: string; name: string; slug: string };
};
type Member = {
  id: string;
  role: string;
  status: string;
  user: { email: string };
};
type Invitation = {
  id: string;
  emailNormalized: string;
  role: string;
  expiresAt: string;
};

function OrganizationManager() {
  const {
    organizations,
    organization,
    authenticatedRequest,
    adoptAccessToken,
  } = useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");

  const reloadOrganization = useCallback(async () => {
    if (!organization) {
      setMembers([]);
      setInvitations([]);
      return;
    }
    const nextMembers = await authenticatedRequest<Member[]>(
      "/organizations/current/members",
    ).catch(() => []);
    setMembers(nextMembers);
    if (organization.role === "OWNER" || organization.role === "ADMIN") {
      const nextInvitations = await authenticatedRequest<Invitation[]>(
        "/organizations/current/invitations",
      ).catch(() => []);
      setInvitations(nextInvitations);
    } else setInvitations([]);
  }, [organization, authenticatedRequest]);

  useEffect(() => {
    void Promise.resolve().then(reloadOrganization);
  }, [reloadOrganization]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await authenticatedRequest<{ accessToken: string }>(
        "/organizations",
        { name, ...(slug ? { slug } : {}) },
      );
      await adoptAccessToken(result.accessToken);
      setName("");
      setSlug("");
      setMessage("Organization created. You are its owner.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create organization.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function select(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await authenticatedRequest<{ accessToken: string }>(
        `/organizations/${id}/select`,
        {},
      );
      await adoptAccessToken(result.accessToken);
      setMessage("Active organization changed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not change organization.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await authenticatedRequest("/organizations/current/invitations", {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail("");
      setMessage("Invitation sent.");
      await reloadOrganization();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(memberId: string) {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/members/${memberId}/deactivate`,
        {},
        "POST",
      );
      await reloadOrganization();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not deactivate member.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invitationId: string) {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/invitations/${invitationId}/revoke`,
        {},
        "POST",
      );
      await reloadOrganization();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not revoke invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="org-title">
        <Link href="/" className="text-button">
          ← Dashboard
        </Link>
        <p className="eyebrow">WORKSPACE SETTINGS</p>
        <h1 id="org-title">Organizations</h1>
        <p>
          Manage the organizations connected to your account. Organization data
          is scoped to active membership.
        </p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        <h2>Choose an organization</h2>
        {organizations.length === 0 ? (
          <p>You are not a member of an organization yet.</p>
        ) : (
          <ul>
            {organizations.map(
              (item: Membership["organization"] & { role?: string }) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>{" "}
                  <span>({item.role ?? "MEMBER"})</span>
                  {organization?.id === item.id ? (
                    <span> · Active</span>
                  ) : (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void select(item.id)}
                      type="button"
                    >
                      Select
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
        <h2>Create an organization</h2>
        <form className="auth-form" onSubmit={(event) => void create(event)}>
          <label htmlFor="org-name">Organization name</label>
          <input
            id="org-name"
            autoComplete="organization"
            minLength={2}
            maxLength={160}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor="org-slug">
            URL slug <span>(optional)</span>
          </label>
          <input
            id="org-slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            maxLength={80}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Please wait…" : "Create organization"}
          </button>
        </form>
        <p>
          <Link href="/organizations/accept-invitation">
            Accept an invitation
          </Link>{" "}
          if you have an invitation token.
        </p>
        {organization && (
          <>
            <h2>Members</h2>
            <ul>
              {members.map((member) => (
                <li key={member.id}>
                  <strong>{member.user.email}</strong> · {member.role} ·{" "}
                  {member.status}
                  {member.role !== "OWNER" && member.status === "ACTIVE" && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void deactivate(member.id)}
                      type="button"
                    >
                      Deactivate
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {(organization.role === "OWNER" ||
              organization.role === "ADMIN") && (
              <>
                <h2>Invite a member</h2>
                <form
                  className="auth-form"
                  onSubmit={(event) => void invite(event)}
                >
                  <label htmlFor="invite-email">Email address</label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                  <label htmlFor="invite-role">Role</label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as "MEMBER" | "ADMIN")
                    }
                  >
                    <option value="MEMBER">Member</option>
                    {organization.role === "OWNER" && (
                      <option value="ADMIN">Administrator</option>
                    )}
                  </select>
                  <button
                    className="primary-button"
                    disabled={busy}
                    type="submit"
                  >
                    Send invitation
                  </button>
                </form>
                <h2>Pending invitations</h2>
                <ul>
                  {invitations.map((invitation) => (
                    <li key={invitation.id}>
                      {invitation.emailNormalized} · {invitation.role} · expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}{" "}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void revoke(invitation.id)}
                        type="button"
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default function OrganizationsPage() {
  return (
    <ProtectedContent>
      <OrganizationManager />
    </ProtectedContent>
  );
}
