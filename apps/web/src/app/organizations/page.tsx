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
type Warehouse = { id: string; name: string; code: string };
const memberRoles = [
  "MEMBER",
  "READ_ONLY",
  "BUYER",
  "SALES",
  "WAREHOUSE_CLERK",
  "FINANCE",
  "MANAGER",
  "ADMIN",
] as const;

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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseGrants, setWarehouseGrants] = useState<
    Record<string, string[]>
  >({});
  const [memberRolesById, setMemberRolesById] = useState<
    Record<string, string>
  >({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("MEMBER");

  const reloadOrganization = useCallback(async () => {
    if (!organization) {
      setMembers([]);
      setInvitations([]);
      setWarehouses([]);
      setWarehouseGrants({});
      return;
    }
    const nextMembers = await authenticatedRequest<Member[]>(
      "/organizations/current/members",
    ).catch(() => []);
    setMembers(nextMembers);
    setMemberRolesById(
      Object.fromEntries(nextMembers.map((member) => [member.id, member.role])),
    );
    if (organization.role === "OWNER" || organization.role === "ADMIN") {
      const [nextInvitations, nextWarehouses] = await Promise.all([
        authenticatedRequest<Invitation[]>(
          "/organizations/current/invitations",
        ).catch(() => []),
        authenticatedRequest<{ data: Warehouse[] }>(
          "/organizations/current/warehouses",
        ).catch(() => ({ data: [] })),
      ]);
      setInvitations(nextInvitations);
      setWarehouses(nextWarehouses.data);
      const grantEntries = await Promise.all(
        nextMembers
          .filter(
            (member) => member.role !== "OWNER" && member.status === "ACTIVE",
          )
          .map(async (member) => {
            const grants = await authenticatedRequest<Warehouse[]>(
              `/organizations/current/members/${member.id}/warehouse-grants`,
            ).catch(() => []);
            return [member.id, grants.map(({ id }) => id)] as const;
          }),
      );
      setWarehouseGrants(Object.fromEntries(grantEntries));
    } else {
      setInvitations([]);
      setWarehouses([]);
      setWarehouseGrants({});
    }
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

  async function updateRole(memberId: string) {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/members/${memberId}/role`,
        {
          role: memberRolesById[memberId],
        },
        "PATCH",
      );
      setMessage("Member role updated.");
      await reloadOrganization();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update role.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveWarehouseGrants(memberId: string) {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/members/${memberId}/warehouse-grants`,
        {
          warehouseIds: warehouseGrants[memberId] ?? [],
        },
        "PUT",
      );
      setMessage("Warehouse access updated.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update warehouse access.",
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
    <main className="auth-page organization-page">
      <section
        className="auth-card organization-card"
        aria-labelledby="org-title"
      >
        <Link href="/" className="text-button">
          ← Dashboard
        </Link>
        <p className="eyebrow">WORKSPACE SETTINGS</p>
        <h1 id="org-title">Organizations</h1>
        <p className="organization-description">
          Manage the organizations connected to your account. Organization data
          is scoped to active membership.
        </p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        <section
          className="organization-section"
          aria-labelledby="choose-org-title"
        >
          <h2 id="choose-org-title">Choose an organization</h2>
          {organizations.length === 0 ? (
            <p>You are not a member of an organization yet.</p>
          ) : (
            <ul className="organization-list">
              {organizations.map(
                (item: Membership["organization"] & { role?: string }) => (
                  <li key={item.id}>
                    <span className="organization-list-info">
                      <strong>{item.name}</strong>
                      <span className="organization-role">
                        {item.role ?? "MEMBER"}
                      </span>
                    </span>
                    {organization?.id === item.id ? (
                      <span className="organization-active">Active</span>
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
        </section>
        <section
          className="organization-section"
          aria-labelledby="create-org-title"
        >
          <h2 id="create-org-title">Create an organization</h2>
          <form
            className="organization-form"
            onSubmit={(event) => void create(event)}
          >
            <label htmlFor="org-name">
              Organization name
              <input
                id="org-name"
                autoComplete="organization"
                minLength={2}
                maxLength={160}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label htmlFor="org-slug">
              URL slug <span>(optional)</span>
              <input
                id="org-slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={80}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Please wait…" : "Create organization"}
            </button>
          </form>
          <p className="organization-help-links">
            <Link href="/locations">Manage branches and warehouses</Link>
          </p>
          <p className="organization-help-links">
            <Link href="/organizations/accept-invitation">
              Accept an invitation
            </Link>{" "}
            if you have an invitation token.
          </p>
        </section>
        {organization && (
          <>
            <section
              className="organization-section"
              aria-labelledby="members-title"
            >
              <h2 id="members-title">Members</h2>
              <ul className="organization-list organization-members">
                {members.map((member) => (
                  <li key={member.id}>
                    <strong>{member.user.email}</strong> · {member.role} ·{" "}
                    {member.status}
                    {(organization.role === "OWNER" ||
                      organization.role === "ADMIN") &&
                      member.role !== "OWNER" &&
                      member.status === "ACTIVE" && (
                        <div className="organization-member-controls">
                          <label htmlFor={`role-${member.id}`}>Role</label>
                          <select
                            id={`role-${member.id}`}
                            value={memberRolesById[member.id] ?? member.role}
                            onChange={(event) =>
                              setMemberRolesById((current) => ({
                                ...current,
                                [member.id]: event.target.value,
                              }))
                            }
                          >
                            {memberRoles
                              .filter(
                                (role) =>
                                  organization.role === "OWNER" ||
                                  (role !== "ADMIN" && role !== "MANAGER"),
                              )
                              .map((role) => (
                                <option key={role} value={role}>
                                  {role.replaceAll("_", " ")}
                                </option>
                              ))}
                          </select>
                          <button
                            className="text-button"
                            disabled={
                              busy || memberRolesById[member.id] === member.role
                            }
                            onClick={() => void updateRole(member.id)}
                            type="button"
                          >
                            Save role
                          </button>
                          <fieldset>
                            <legend>Warehouse access</legend>
                            {warehouses.length === 0 ? (
                              <p>
                                Create a warehouse in Locations to assign
                                access.
                              </p>
                            ) : (
                              warehouses.map((warehouse) => (
                                <label key={warehouse.id}>
                                  <input
                                    type="checkbox"
                                    checked={(
                                      warehouseGrants[member.id] ?? []
                                    ).includes(warehouse.id)}
                                    onChange={(event) =>
                                      setWarehouseGrants((current) => ({
                                        ...current,
                                        [member.id]: event.target.checked
                                          ? [
                                              ...(current[member.id] ?? []),
                                              warehouse.id,
                                            ]
                                          : (current[member.id] ?? []).filter(
                                              (id) => id !== warehouse.id,
                                            ),
                                      }))
                                    }
                                  />
                                  {warehouse.name} ({warehouse.code})
                                </label>
                              ))
                            )}
                            {warehouses.length > 0 && (
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  void saveWarehouseGrants(member.id)
                                }
                                type="button"
                              >
                                Save access
                              </button>
                            )}
                          </fieldset>
                        </div>
                      )}
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
            </section>
            {(organization.role === "OWNER" ||
              organization.role === "ADMIN") && (
              <>
                <section
                  className="organization-section"
                  aria-labelledby="invite-title"
                >
                  <h2 id="invite-title">Invite a member</h2>
                  <form
                    className="organization-form organization-invite-form"
                    onSubmit={(event) => void invite(event)}
                  >
                    <label htmlFor="invite-email">
                      Email address
                      <input
                        id="invite-email"
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                      />
                    </label>
                    <label htmlFor="invite-role">
                      Role
                      <select
                        id="invite-role"
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.target.value)}
                      >
                        {memberRoles
                          .filter(
                            (role) =>
                              organization.role === "OWNER" ||
                              (role !== "ADMIN" && role !== "MANAGER"),
                          )
                          .map((role) => (
                            <option key={role} value={role}>
                              {role.replaceAll("_", " ")}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      className="primary-button"
                      disabled={busy}
                      type="submit"
                    >
                      Send invitation
                    </button>
                  </form>
                </section>
                <section
                  className="organization-section"
                  aria-labelledby="pending-title"
                >
                  <h2 id="pending-title">Pending invitations</h2>
                  <ul className="organization-list">
                    {invitations.map((invitation) => (
                      <li key={invitation.id}>
                        {invitation.emailNormalized} · {invitation.role} ·
                        expires{" "}
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
                </section>
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
