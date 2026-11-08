"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "../features/auth/session-provider";

const groups = [
  {
    label: "WORKSPACE",
    links: [{ href: "/", label: "Overview", icon: "overview" }],
  },
  {
    label: "INVENTORY",
    links: [
      { href: "/products", label: "Products", icon: "products" },
      { href: "/imports", label: "Import data", icon: "catalog" },
      { href: "/inventory", label: "Stock counts", icon: "counts" },
      { href: "/transfers", label: "Transfers", icon: "purchasing" },
      { href: "/locations", label: "Branches & warehouses", icon: "locations" },
      { href: "/catalog", label: "Categories & units", icon: "catalog" },
    ],
  },
  {
    label: "PURCHASING",
    links: [
      {
        href: "/purchase-orders",
        label: "Purchase orders",
        icon: "purchasing",
      },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
    ],
  },
  {
    label: "SALES",
    links: [
      { href: "/sales-orders", label: "Sales orders", icon: "purchasing" },
      { href: "/customers", label: "Customers", icon: "suppliers" },
    ],
  },
  {
    label: "MANAGEMENT",
    links: [
      { href: "/organizations", label: "Workspace settings", icon: "settings" },
    ],
  },
];

const names: Record<string, string> = {
  "": "Overview",
  products: "Products",
  imports: "Import data",
  inventory: "Stock counts",
  transfers: "Warehouse transfers",
  locations: "Branches & warehouses",
  catalog: "Categories & units",
  "purchase-orders": "Purchase orders",
  suppliers: "Suppliers",
  customers: "Customers",
  "sales-orders": "Sales orders",
  organizations: "Workspace settings",
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </>
    ),
    products: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12v9" />
      </>
    ),
    counts: (
      <>
        <path d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
        <path d="M9 3h6v4H9zM8 12h8M8 16h5" />
      </>
    ),
    locations: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    catalog: (
      <>
        <path d="M4 5h16M4 12h16M4 19h10" />
        <circle cx="7" cy="5" r="1" />
        <circle cx="15" cy="12" r="1" />
      </>
    ),
    purchasing: (
      <>
        <path d="M12 3v12m0 0 5-5m-5 5-5-5" />
        <path d="M5 17v3h14v-3" />
      </>
    ),
    suppliers: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m19.4 15 .1.1 1.3 1-1.4 2.4-1.6-.6a8 8 0 0 1-1.5.9l-.3 1.7h-2.8l-.3-1.7a8 8 0 0 1-1.5-.9l-1.6.6-1.4-2.4 1.3-1a7 7 0 0 1 0-1.8l-1.3-1 1.4-2.4 1.6.6a8 8 0 0 1 1.5-.9l.3-1.7H16l.3 1.7a8 8 0 0 1 1.5.9l1.6-.6 1.4 2.4-1.3 1a7 7 0 0 1-.1 1.8Z" />
      </>
    ),
  };
  return (
    <span aria-hidden="true" className="nav-icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name]}
      </svg>
    </span>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    user,
    logout,
    organization,
    organizations,
    authenticatedRequest,
    adoptAccessToken,
  } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [orgError, setOrgError] = useState("");
  const role = organization?.role ?? "";
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      links: group.links.filter((item) =>
        item.href === "/organizations"
          ? ["OWNER", "ADMIN", "MANAGER"].includes(role)
          : item.href === "/customers"
            ? role !== "BUYER"
            : item.href === "/sales-orders"
              ? role !== "BUYER"
              : item.href === "/purchase-orders" || item.href === "/suppliers"
                ? ["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE"].includes(
                    role,
                  )
                : item.href === "/locations"
                  ? [
                      "OWNER",
                      "ADMIN",
                      "MANAGER",
                      "BUYER",
                      "WAREHOUSE_CLERK",
                      "READ_ONLY",
                      "MEMBER",
                      "SALES",
                      "FINANCE",
                    ].includes(role)
                  : [
                      "OWNER",
                      "ADMIN",
                      "MANAGER",
                      "BUYER",
                      "WAREHOUSE_CLERK",
                      "READ_ONLY",
                      "MEMBER",
                      "SALES",
                      "FINANCE",
                    ].includes(role),
      ),
    }))
    .filter((group) => group.links.length > 0);
  const title = useMemo(() => {
    const first = pathname.split("/")[1] ?? "";
    if (first === "purchase-orders" && pathname.split("/").length > 2)
      return "Purchase order";
    if (first === "products" && pathname.split("/").length > 2)
      return "Product details";
    return names[first] ?? "Workspace";
  }, [pathname]);

  async function selectOrganization(id: string) {
    if (id === organization?.id) return;
    setSwitching(true);
    setOrgError("");
    try {
      const response = await authenticatedRequest<{ accessToken: string }>(
        `/organizations/${id}/select`,
        {},
      );
      await adoptAccessToken(response.accessToken);
    } catch (error) {
      setOrgError(
        error instanceof Error ? error.message : "Could not switch workspace.",
      );
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className={`workspace-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menuOpen && (
        <button
          aria-label="Close navigation"
          className="mobile-backdrop"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      )}
      <aside
        aria-label="Workspace sidebar"
        className={`sidebar${menuOpen ? " sidebar-open" : ""}`}
      >
        <Link aria-label="Stockroom home" className="brand" href="/">
          <span aria-hidden="true" className="brand-mark">
            S
          </span>
          <span className="brand-name">stockroom</span>
        </Link>
        <label className="workspace-switcher-label" htmlFor="workspace-select">
          WORKSPACE
        </label>
        <div className="workspace-switcher-wrap">
          <span className="workspace-avatar">
            {(organization?.name ?? "W").slice(0, 1).toUpperCase()}
          </span>
          <select
            aria-label="Switch organization"
            className="workspace-select"
            disabled={switching || organizations.length < 2}
            id="workspace-select"
            onChange={(event) => void selectOrganization(event.target.value)}
            value={organization?.id ?? ""}
          >
            <option value="">{organization?.name ?? "Select workspace"}</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {organizations.length < 2 && (
            <span aria-hidden="true" className="switcher-chevron">
              ⌄
            </span>
          )}
        </div>
        {orgError && (
          <p className="workspace-switch-error" role="alert">
            {orgError}
          </p>
        )}
        <nav aria-label="Main navigation" className="primary-nav">
          {visibleGroups.map((group) => (
            <section className="nav-group" key={group.label}>
              <h2 className="nav-heading">{group.label}</h2>
              {group.links.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`nav-link${active ? " nav-link-active" : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name={item.icon} />
                    <span className="nav-link-label">{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-card">
            <span className="profile-avatar">
              {(user?.email ?? "U").slice(0, 1).toUpperCase()}
            </span>
            <span className="profile-copy">
              <strong>{user?.email ?? "Your account"}</strong>
              <small>{organization?.role ?? "Signed in"}</small>
            </span>
            <button
              aria-label="Log out"
              className="profile-logout"
              onClick={() => void logout()}
              type="button"
            >
              ↗
            </button>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            aria-controls="main-navigation"
            aria-expanded={menuOpen}
            aria-label="Open navigation"
            className="mobile-menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            ☰
          </button>
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            type="button"
          >
            {collapsed ? "»" : "«"}
          </button>
          <div aria-label="Breadcrumb" className="breadcrumbs">
            <Link href="/">Workspace</Link>
            <span aria-hidden="true">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="organization-context">
              {organization?.name ?? "No workspace selected"}
            </span>
            <button
              className="account-button"
              onClick={() => void logout()}
              type="button"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="page-content workspace-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export function ApplicationFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSession();
  const publicRoute = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ].includes(pathname);
  useEffect(() => {
    if (!publicRoute && state === "anonymous") router.replace("/login");
  }, [publicRoute, router, state]);
  if (publicRoute) return <>{children}</>;
  if (state !== "authenticated")
    return (
      <main className="auth-loading" aria-live="polite">
        {state === "loading"
          ? "Checking your session…"
          : "Redirecting to sign in…"}
      </main>
    );
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
