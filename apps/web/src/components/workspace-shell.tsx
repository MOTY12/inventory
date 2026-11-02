"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "../features/auth/session-provider";

const navigation = [
  { href: "#overview", label: "Overview", icon: "⌂" },
  { href: "/catalog", label: "Catalog setup", icon: "▧" },
  { href: "#inventory", label: "Inventory", icon: "▦" },
  { href: "#purchasing", label: "Purchasing", icon: "⇣" },
  { href: "#sales", label: "Sales", icon: "⇡" },
  { href: "#reports", label: "Reports", icon: "▤" },
];

export function WorkspaceShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout, organization } = useSession();

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menuOpen && (
        <button
          aria-label="Close navigation menu"
          className="mobile-backdrop"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      )}
      <aside
        aria-label="Workspace sidebar"
        className={`sidebar${menuOpen ? " sidebar-open" : ""}`}
      >
        <a
          aria-label="Stockroom home"
          className="brand"
          href="#overview"
          onClick={() => setMenuOpen(false)}
        >
          <span aria-hidden="true" className="brand-mark">
            S
          </span>
          <span className="brand-name">stockroom</span>
        </a>

        <div className="workspace-switcher">
          <span aria-hidden="true" className="workspace-avatar">
            W
          </span>
          <span className="workspace-switcher-copy">
            <strong>{organization?.name ?? "Workspace"}</strong>
            <small>
              {organization ? "Active organization" : "Set up required"}
            </small>
          </span>
          <span aria-hidden="true" className="switcher-chevron">
            ⌄
          </span>
        </div>

        <nav
          aria-label="Main navigation"
          className="primary-nav"
          id="main-navigation"
        >
          <span className="nav-heading">WORKSPACE</span>
          {navigation.map((item, index) => (
            <a
              aria-current={index === 0 ? "page" : undefined}
              className={`nav-link${index === 0 ? " nav-link-active" : ""}`}
              href={item.href}
              key={item.label}
              onClick={() => setMenuOpen(false)}
            >
              <span aria-hidden="true" className="nav-icon">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <a
            className="nav-link"
            href="#settings"
            onClick={() => setMenuOpen(false)}
          >
            <span aria-hidden="true" className="nav-icon">
              ⚙
            </span>
            <span>Settings</span>
          </a>
          <div className="profile-card">
            <span aria-hidden="true" className="profile-avatar">
              Y
            </span>
            <span className="profile-copy">
              <strong>{user?.email ?? "Your account"}</strong>
              <small>Signed in</small>
            </span>
            <button
              className="profile-menu profile-logout"
              onClick={() => void logout()}
              type="button"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            aria-controls="main-navigation"
            aria-expanded={menuOpen}
            aria-label={
              menuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            className="mobile-menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div aria-label="Current location" className="breadcrumbs">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>Overview</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment-pill">
              <span aria-hidden="true" /> LOCAL PREVIEW
            </span>
            <button
              aria-label="Help and support is not available yet"
              className="help-button"
              disabled
              title="Help center is planned"
              type="button"
            >
              ?
            </button>
          </div>
        </header>

        <main id="main-content" className="page-content">
          <section
            aria-labelledby="page-title"
            className="page-heading"
            id="overview"
          >
            <div>
              <p className="eyebrow">YOUR OPERATIONS, IN ONE PLACE</p>
              <h1 id="page-title">Overview</h1>
              <p className="page-description">
                A clear starting point for your stock operations.
              </p>
            </div>
            <span className="date-chip">Workspace not connected</span>
          </section>

          <section
            aria-labelledby="setup-title"
            className="setup-banner"
            id="setup"
          >
            <div aria-hidden="true" className="setup-art">
              <span className="art-box art-box-back" />
              <span className="art-box art-box-front" />
              <span className="art-spark">✳</span>
            </div>
            <div className="setup-copy">
              <p className="eyebrow">LET’S GET YOU STARTED</p>
              <h2 id="setup-title">Your workspace is ready to set up</h2>
              <p>
                Create your organization and add a location to begin tracking
                stock. Your dashboard will show live information once your
                workspace is connected.
              </p>
            </div>
            <Link className="primary-button" href="/organizations">
              {organization ? "Manage organization" : "Set up workspace"}{" "}
              <span aria-hidden="true">→</span>
            </Link>
          </section>

          <section aria-label="Workspace summary" className="summary-grid">
            <article className="summary-card" id="inventory">
              <div className="summary-card-heading">
                <span>Inventory</span>
                <span
                  aria-hidden="true"
                  className="summary-icon summary-icon-green"
                >
                  ▦
                </span>
              </div>
              <p className="summary-empty">Waiting for setup</p>
              <p className="summary-note">
                Products and stock levels will appear here.
              </p>
            </article>
            <article className="summary-card" id="purchasing">
              <div className="summary-card-heading">
                <span>Purchasing</span>
                <span
                  aria-hidden="true"
                  className="summary-icon summary-icon-amber"
                >
                  ⇣
                </span>
              </div>
              <p className="summary-empty">Waiting for setup</p>
              <p className="summary-note">
                Suppliers and purchase orders will appear here.
              </p>
            </article>
            <article className="summary-card" id="sales">
              <div className="summary-card-heading">
                <span>Sales</span>
                <span
                  aria-hidden="true"
                  className="summary-icon summary-icon-blue"
                >
                  ⇡
                </span>
              </div>
              <p className="summary-empty">Waiting for setup</p>
              <p className="summary-note">
                Customers and sales orders will appear here.
              </p>
            </article>
          </section>

          <section
            aria-label="Recent activity"
            className="activity-card"
            id="reports"
          >
            <div className="activity-heading">
              <div>
                <h2>Recent activity</h2>
                <p>Updates from across your workspace</p>
              </div>
              <button className="text-button" disabled type="button">
                View activity <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="activity-empty">
              <span aria-hidden="true" className="activity-empty-icon">
                ◷
              </span>
              <strong>Nothing to show yet</strong>
              <p>Activity will appear here after your workspace is set up.</p>
            </div>
          </section>

          <footer className="page-footer" id="settings">
            <span>Stockroom preview</span>
            <span>Inventory, with a little more clarity.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
