"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  status: "ACTIVE" | "ARCHIVED";
  _count?: { warehouses: number };
};
type Warehouse = {
  id: string;
  branchId: string | null;
  name: string;
  code: string;
  status: "ACTIVE" | "ARCHIVED";
  branch?: { id: string; name: string } | null;
};
type PageResult<T> = { data: T[]; total: number };

function LocationsManager() {
  const { organization, authenticatedRequest } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseCode, setWarehouseCode] = useState("");
  const [warehouseBranch, setWarehouseBranch] = useState("");
  const [branchEdits, setBranchEdits] = useState<
    Record<string, { name: string; address: string }>
  >({});
  const [warehouseEdits, setWarehouseEdits] = useState<
    Record<string, { name: string; code: string; branchId: string }>
  >({});
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ARCHIVED" | "">(
    "ACTIVE",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canManage =
    organization?.role === "OWNER" ||
    organization?.role === "ADMIN" ||
    organization?.role === "MANAGER";
  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: "1", page_size: "100" });
    if (filter.trim()) query.set("q", filter.trim());
    if (statusFilter) query.set("status", statusFilter);
    return query.toString();
  }, [filter, statusFilter]);

  const reload = useCallback(async () => {
    if (!organization) {
      setBranches([]);
      setWarehouses([]);
      return;
    }
    const [branchResult, warehouseResult] = await Promise.all([
      authenticatedRequest<PageResult<Branch>>(
        `/organizations/current/branches?${queryString}`,
      ),
      authenticatedRequest<PageResult<Warehouse>>(
        `/organizations/current/warehouses?${queryString}`,
      ),
    ]);
    setBranches(branchResult.data);
    setWarehouses(warehouseResult.data);
    setWarehouseBranch(
      (current) =>
        current ||
        branchResult.data.find((branch) => branch.status === "ACTIVE")?.id ||
        "",
    );
  }, [organization, authenticatedRequest, queryString]);

  useEffect(() => {
    void Promise.resolve()
      .then(reload)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : "Could not load locations.",
        );
      });
  }, [reload]);

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await authenticatedRequest("/organizations/current/branches", {
        name: branchName,
        ...(branchAddress ? { address: branchAddress } : {}),
      });
      setBranchName("");
      setBranchAddress("");
      setMessage("Branch created.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create branch.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await authenticatedRequest("/organizations/current/warehouses", {
        branchId: warehouseBranch,
        name: warehouseName,
        code: warehouseCode,
      });
      setWarehouseName("");
      setWarehouseCode("");
      setMessage("Warehouse created.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create warehouse.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function setBranchStatus(branch: Branch) {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/branches/${branch.id}`,
        {
          status: branch.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
        },
        "PATCH",
      );
      setMessage(
        branch.status === "ACTIVE" ? "Branch archived." : "Branch activated.",
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update branch.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveBranch(branch: Branch) {
    const edit = branchEdits[branch.id];
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/branches/${branch.id}`,
        edit,
        "PATCH",
      );
      setBranchEdits((current) => {
        const next = { ...current };
        delete next[branch.id];
        return next;
      });
      setMessage("Branch details saved.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update branch.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function setWarehouseStatus(warehouse: Warehouse) {
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/warehouses/${warehouse.id}`,
        {
          status: warehouse.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
        },
        "PATCH",
      );
      setMessage(
        warehouse.status === "ACTIVE"
          ? "Warehouse archived."
          : "Warehouse activated.",
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update warehouse.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveWarehouse(warehouse: Warehouse) {
    const edit = warehouseEdits[warehouse.id];
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `/organizations/current/warehouses/${warehouse.id}`,
        {
          name: edit.name,
          code: edit.code,
          ...(edit.branchId && edit.branchId !== warehouse.branchId
            ? { branchId: edit.branchId }
            : {}),
        },
        "PATCH",
      );
      setWarehouseEdits((current) => {
        const next = { ...current };
        delete next[warehouse.id];
        return next;
      });
      setMessage("Warehouse details saved.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update warehouse.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section
        className="auth-card locations-card"
        aria-labelledby="locations-title"
      >
        <Link href="/" className="text-button">
          ← Dashboard
        </Link>
        <p className="eyebrow">WORKSPACE SETTINGS</p>
        <h1 id="locations-title">Branches and warehouses</h1>
        <p>
          Locations belong to the active organization. Warehouse access follows
          each member’s assigned scope.
        </p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        {!organization && (
          <p>Select an organization before managing locations.</p>
        )}
        {organization && (
          <>
            <div className="locations-filters">
              <div className="locations-field">
                <label htmlFor="location-search">Search locations</label>
                <input
                  id="location-search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Branch, warehouse or code"
                />
              </div>
              <div className="locations-field">
                <label htmlFor="location-status">Status</label>
                <select
                  id="location-status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as "ACTIVE" | "ARCHIVED" | "",
                    )
                  }
                >
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="">All</option>
                </select>
              </div>
            </div>
            <h2>Branches</h2>
            {branches.length === 0 ? (
              <p>No branches match these filters.</p>
            ) : (
              <ul className="locations-list">
                {branches.map((branch) => (
                  <li key={branch.id}>
                    <strong>{branch.name}</strong> · {branch.status}
                    {branch.address ? ` · ${branch.address}` : ""}
                    {canManage && (
                      <>
                        <details>
                          <summary>Edit branch</summary>
                          <form
                            className="auth-form locations-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveBranch(branch);
                            }}
                          >
                            <label htmlFor={`branch-name-${branch.id}`}>
                              Name
                            </label>
                            <input
                              id={`branch-name-${branch.id}`}
                              minLength={2}
                              maxLength={160}
                              required
                              value={
                                branchEdits[branch.id]?.name ?? branch.name
                              }
                              onChange={(event) =>
                                setBranchEdits((current) => ({
                                  ...current,
                                  [branch.id]: {
                                    name: event.target.value,
                                    address:
                                      current[branch.id]?.address ??
                                      branch.address ??
                                      "",
                                  },
                                }))
                              }
                            />
                            <label htmlFor={`branch-address-${branch.id}`}>
                              Address
                            </label>
                            <input
                              id={`branch-address-${branch.id}`}
                              maxLength={500}
                              value={
                                branchEdits[branch.id]?.address ??
                                branch.address ??
                                ""
                              }
                              onChange={(event) =>
                                setBranchEdits((current) => ({
                                  ...current,
                                  [branch.id]: {
                                    name:
                                      current[branch.id]?.name ?? branch.name,
                                    address: event.target.value,
                                  },
                                }))
                              }
                            />
                            <button
                              className="text-button"
                              type="submit"
                              disabled={busy}
                            >
                              Save branch
                            </button>
                          </form>
                        </details>
                        <button
                          className="text-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void setBranchStatus(branch)}
                        >
                          {branch.status === "ACTIVE" ? "Archive" : "Activate"}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <>
                <h3>Create a branch</h3>
                <form
                  className="auth-form locations-form"
                  onSubmit={(event) => void createBranch(event)}
                >
                  <label htmlFor="branch-name">Name</label>
                  <input
                    id="branch-name"
                    minLength={2}
                    maxLength={160}
                    required
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                  />
                  <label htmlFor="branch-address">
                    Address <span>(optional)</span>
                  </label>
                  <input
                    id="branch-address"
                    maxLength={500}
                    value={branchAddress}
                    onChange={(event) => setBranchAddress(event.target.value)}
                  />
                  <button
                    className="primary-button"
                    disabled={busy}
                    type="submit"
                  >
                    Create branch
                  </button>
                </form>
              </>
            )}
            <h2>Warehouses</h2>
            {warehouses.length === 0 ? (
              <p>No warehouses match these filters.</p>
            ) : (
              <ul className="locations-list">
                {warehouses.map((warehouse) => (
                  <li key={warehouse.id}>
                    <strong>{warehouse.name}</strong> · {warehouse.code} ·{" "}
                    {warehouse.branch?.name ?? "Unassigned legacy warehouse"} ·{" "}
                    {warehouse.status}
                    {canManage && (
                      <>
                        <details>
                          <summary>Edit warehouse</summary>
                          <form
                            className="auth-form locations-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveWarehouse(warehouse);
                            }}
                          >
                            <label htmlFor={`warehouse-name-${warehouse.id}`}>
                              Name
                            </label>
                            <input
                              id={`warehouse-name-${warehouse.id}`}
                              minLength={2}
                              maxLength={160}
                              required
                              value={
                                warehouseEdits[warehouse.id]?.name ??
                                warehouse.name
                              }
                              onChange={(event) =>
                                setWarehouseEdits((current) => ({
                                  ...current,
                                  [warehouse.id]: {
                                    name: event.target.value,
                                    code:
                                      current[warehouse.id]?.code ??
                                      warehouse.code,
                                    branchId:
                                      current[warehouse.id]?.branchId ??
                                      warehouse.branchId ??
                                      "",
                                  },
                                }))
                              }
                            />
                            <label htmlFor={`warehouse-code-${warehouse.id}`}>
                              Code
                            </label>
                            <input
                              id={`warehouse-code-${warehouse.id}`}
                              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                              maxLength={40}
                              required
                              value={
                                warehouseEdits[warehouse.id]?.code ??
                                warehouse.code
                              }
                              onChange={(event) =>
                                setWarehouseEdits((current) => ({
                                  ...current,
                                  [warehouse.id]: {
                                    name:
                                      current[warehouse.id]?.name ??
                                      warehouse.name,
                                    code: event.target.value,
                                    branchId:
                                      current[warehouse.id]?.branchId ??
                                      warehouse.branchId ??
                                      "",
                                  },
                                }))
                              }
                            />
                            <label htmlFor={`warehouse-branch-${warehouse.id}`}>
                              Branch
                            </label>
                            <select
                              id={`warehouse-branch-${warehouse.id}`}
                              required
                              value={
                                warehouseEdits[warehouse.id]?.branchId ??
                                warehouse.branchId ??
                                ""
                              }
                              onChange={(event) =>
                                setWarehouseEdits((current) => ({
                                  ...current,
                                  [warehouse.id]: {
                                    name:
                                      current[warehouse.id]?.name ??
                                      warehouse.name,
                                    code:
                                      current[warehouse.id]?.code ??
                                      warehouse.code,
                                    branchId: event.target.value,
                                  },
                                }))
                              }
                            >
                              {branches
                                .filter(
                                  (branch) =>
                                    branch.status === "ACTIVE" ||
                                    branch.id === warehouse.branchId,
                                )
                                .map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="text-button"
                              type="submit"
                              disabled={busy}
                            >
                              Save warehouse
                            </button>
                          </form>
                        </details>
                        <button
                          className="text-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void setWarehouseStatus(warehouse)}
                        >
                          {warehouse.status === "ACTIVE"
                            ? "Archive"
                            : "Activate"}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <>
                <h3>Create a warehouse</h3>
                {branches.every((branch) => branch.status !== "ACTIVE") ? (
                  <p>Create or activate a branch first.</p>
                ) : (
                  <form
                    className="auth-form locations-form"
                    onSubmit={(event) => void createWarehouse(event)}
                  >
                    <label htmlFor="warehouse-branch">Branch</label>
                    <select
                      id="warehouse-branch"
                      required
                      value={warehouseBranch}
                      onChange={(event) =>
                        setWarehouseBranch(event.target.value)
                      }
                    >
                      {branches
                        .filter((branch) => branch.status === "ACTIVE")
                        .map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                    </select>
                    <label htmlFor="warehouse-name">Name</label>
                    <input
                      id="warehouse-name"
                      minLength={2}
                      maxLength={160}
                      required
                      value={warehouseName}
                      onChange={(event) => setWarehouseName(event.target.value)}
                    />
                    <label htmlFor="warehouse-code">Code</label>
                    <input
                      id="warehouse-code"
                      pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                      maxLength={40}
                      required
                      value={warehouseCode}
                      onChange={(event) => setWarehouseCode(event.target.value)}
                    />
                    <button
                      className="primary-button"
                      disabled={busy}
                      type="submit"
                    >
                      Create warehouse
                    </button>
                  </form>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default function LocationsPage() {
  return (
    <ProtectedContent>
      <LocationsManager />
    </ProtectedContent>
  );
}
