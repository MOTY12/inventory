"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ProtectedContent,
  useSession,
} from "../../features/auth/session-provider";
import {
  DataTable,
  type DataTableColumn,
} from "../../components/ui/data-table";
import { PageHeader } from "../../components/ui/page-header";
import { StatusBadge } from "../../components/ui/status-badge";
import { Drawer } from "../../components/ui/drawer";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { TableToolbar } from "../../components/ui/table-toolbar";
import { TablePagination } from "../../components/ui/table-pagination";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  status: "ACTIVE" | "ARCHIVED";
};
type Warehouse = {
  id: string;
  branchId: string | null;
  name: string;
  code: string;
  status: "ACTIVE" | "ARCHIVED";
  branch?: { id: string; name: string } | null;
};
type Page<T> = { data: T[]; total: number };
type Tab = "branches" | "warehouses";
const API = "/organizations/current";

function LocationsManager() {
  const { organization, authenticatedRequest } = useSession();
  const [tab, setTab] = useState<Tab>("branches");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branchOptions, setBranchOptions] = useState<Branch[]>([]);
  const [branchQuery, setBranchQuery] = useState("");
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [branchStatus, setBranchStatus] = useState("ACTIVE");
  const [warehouseStatus, setWarehouseStatusFilter] = useState("ACTIVE");
  const [branchPage, setBranchPage] = useState(1);
  const [warehousePage, setWarehousePage] = useState(1);
  const [branchTotal, setBranchTotal] = useState(0);
  const [warehouseTotal, setWarehouseTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drawer, setDrawer] = useState<
    | "branch-create"
    | "branch-edit"
    | "warehouse-create"
    | "warehouse-edit"
    | null
  >(null);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(
    null,
  );
  const [confirmTarget, setConfirmTarget] = useState<{
    kind: Tab;
    row: Branch | Warehouse;
  } | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseCode, setWarehouseCode] = useState("");
  const [warehouseBranch, setWarehouseBranch] = useState("");
  const [warehouseBranchLabel, setWarehouseBranchLabel] = useState("");
  const canManage = ["OWNER", "ADMIN", "MANAGER"].includes(
    organization?.role ?? "",
  );
  const version = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(
      () => setBranchSearch(branchQuery.trim()),
      250,
    );
    return () => window.clearTimeout(id);
  }, [branchQuery]);
  useEffect(() => {
    const id = window.setTimeout(
      () => setWarehouseSearch(warehouseQuery.trim()),
      250,
    );
    return () => window.clearTimeout(id);
  }, [warehouseQuery]);

  const load = useCallback(async () => {
    const current = ++version.current;
    if (!organization) {
      setBranches([]);
      setWarehouses([]);
      setBranchOptions([]);
      setBranchTotal(0);
      setWarehouseTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const branchParams = new URLSearchParams({
      page: String(branchPage),
      page_size: String(pageSize),
    });
    if (branchSearch) branchParams.set("q", branchSearch);
    if (branchStatus) branchParams.set("status", branchStatus);
    const warehouseParams = new URLSearchParams({
      page: String(warehousePage),
      page_size: String(pageSize),
    });
    if (warehouseSearch) warehouseParams.set("q", warehouseSearch);
    if (warehouseStatus) warehouseParams.set("status", warehouseStatus);
    if (selectedBranch) warehouseParams.set("branchId", selectedBranch);
    try {
      const [branchPageResult, warehousePageResult, optionsResult] =
        await Promise.all([
          authenticatedRequest<Page<Branch>>(`${API}/branches?${branchParams}`),
          authenticatedRequest<Page<Warehouse>>(
            `${API}/warehouses?${warehouseParams}`,
          ),
          authenticatedRequest<Page<Branch>>(
            `${API}/branches?page=1&page_size=100`,
          ),
        ]);
      if (current !== version.current) return;
      setBranches(branchPageResult.data);
      setBranchTotal(branchPageResult.total);
      setWarehouses(warehousePageResult.data);
      setWarehouseTotal(warehousePageResult.total);
      setBranchOptions(optionsResult.data);
    } catch (cause) {
      if (current === version.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Locations could not be loaded.",
        );
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [
    organization,
    authenticatedRequest,
    branchPage,
    warehousePage,
    pageSize,
    branchSearch,
    warehouseSearch,
    branchStatus,
    warehouseStatus,
    selectedBranch,
  ]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function openCreate(kind: "branch" | "warehouse") {
    setError("");
    setNotice("");
    if (kind === "branch") {
      setBranchName("");
      setBranchAddress("");
      setDrawer("branch-create");
    } else {
      const active = branchOptions.filter(
        (branch) => branch.status === "ACTIVE",
      );
      setWarehouseName("");
      setWarehouseCode("");
      setWarehouseBranch(active[0]?.id ?? "");
      setWarehouseBranchLabel(active[0]?.name ?? "");
      setDrawer("warehouse-create");
    }
  }
  function openEdit(row: Branch | Warehouse, kind: Tab) {
    setError("");
    setNotice("");
    if (kind === "branches") {
      const branch = row as Branch;
      setEditingBranch(branch);
      setBranchName(branch.name);
      setBranchAddress(branch.address ?? "");
      setDrawer("branch-edit");
    } else {
      const warehouse = row as Warehouse;
      setEditingWarehouse(warehouse);
      setWarehouseName(warehouse.name);
      setWarehouseCode(warehouse.code);
      setWarehouseBranch(warehouse.branchId ?? "");
      setWarehouseBranchLabel(warehouse.branch?.name ?? "");
      setDrawer("warehouse-edit");
    }
  }
  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (drawer === "branch-create") {
        await authenticatedRequest(`${API}/branches`, {
          name: branchName,
          ...(branchAddress.trim() ? { address: branchAddress } : {}),
        });
        setNotice("Branch created.");
      } else if (drawer === "branch-edit" && editingBranch) {
        await authenticatedRequest(
          `${API}/branches/${editingBranch.id}`,
          { name: branchName, address: branchAddress },
          "PATCH",
        );
        setNotice("Branch updated.");
      } else if (drawer === "warehouse-create") {
        await authenticatedRequest(`${API}/warehouses`, {
          branchId: warehouseBranch,
          name: warehouseName,
          code: warehouseCode,
        });
        setNotice("Warehouse created.");
      } else if (drawer === "warehouse-edit" && editingWarehouse) {
        await authenticatedRequest(
          `${API}/warehouses/${editingWarehouse.id}`,
          {
            name: warehouseName,
            code: warehouseCode,
            ...(warehouseBranch && warehouseBranch !== editingWarehouse.branchId
              ? { branchId: warehouseBranch }
              : {}),
          },
          "PATCH",
        );
        setNotice("Warehouse updated.");
      }
      setDrawer(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The location could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus() {
    if (!confirmTarget) return;
    const { kind, row } = confirmTarget;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(
        `${API}/${kind}/${row.id}`,
        { status: row.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" },
        "PATCH",
      );
      setNotice(
        `${kind === "branches" ? "Branch" : "Warehouse"} ${row.status === "ACTIVE" ? "archived" : "activated"}.`,
      );
      setConfirmTarget(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The location status could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const branchColumns = useMemo<DataTableColumn<Branch>[]>(
    () => [
      {
        key: "name",
        header: "Branch",
        render: (row) => <strong>{row.name}</strong>,
      },
      {
        key: "address",
        header: "Address",
        render: (row) =>
          row.address || <span className="ui-muted-cell">Not provided</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        render: (row) =>
          canManage ? (
            <span className="ui-row-actions">
              <button
                className="ui-quiet-button"
                type="button"
                onClick={() => openEdit(row, "branches")}
              >
                Edit
              </button>
              <button
                className={`ui-quiet-button ${row.status === "ACTIVE" ? "ui-danger-button" : ""}`}
                type="button"
                disabled={busy}
                onClick={() => setConfirmTarget({ kind: "branches", row })}
              >
                {row.status === "ACTIVE" ? "Archive" : "Activate"}
              </button>
              <button
                className="ui-quiet-button"
                type="button"
                onClick={() => {
                  setSelectedBranch(row.id);
                  setWarehousePage(1);
                  setTab("warehouses");
                }}
              >
                Warehouses
              </button>
            </span>
          ) : (
            "—"
          ),
      },
    ],
    [canManage, busy],
  );
  const warehouseColumns = useMemo<DataTableColumn<Warehouse>[]>(
    () => [
      {
        key: "name",
        header: "Warehouse",
        render: (row) => <strong>{row.name}</strong>,
      },
      { key: "code", header: "Code", render: (row) => row.code },
      {
        key: "branch",
        header: "Branch",
        render: (row) =>
          row.branch?.name ?? <span className="ui-muted-cell">Unassigned</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        render: (row) =>
          canManage ? (
            <span className="ui-row-actions">
              <button
                className="ui-quiet-button"
                type="button"
                onClick={() => openEdit(row, "warehouses")}
              >
                Edit
              </button>
              <button
                className={`ui-quiet-button ${row.status === "ACTIVE" ? "ui-danger-button" : ""}`}
                type="button"
                disabled={busy}
                onClick={() => setConfirmTarget({ kind: "warehouses", row })}
              >
                {row.status === "ACTIVE" ? "Archive" : "Activate"}
              </button>
            </span>
          ) : (
            "—"
          ),
      },
    ],
    [canManage, busy],
  );

  return (
    <main className="ui-page">
      <Link href="/" className="text-button">
        ← Dashboard
      </Link>
      <PageHeader
        eyebrow="WORKSPACE SETTINGS"
        title="Branches and warehouses"
        description="Organize your workspace locations and control where inventory is managed."
        action={
          canManage ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() =>
                openCreate(tab === "branches" ? "branch" : "warehouse")
              }
            >
              Add {tab === "branches" ? "branch" : "warehouse"}
            </button>
          ) : undefined
        }
      />
      {notice ? (
        <p role="status" className="ui-success-banner">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="error-banner">
          <span>{error}</span>
          <button
            className="catalog-text-button"
            type="button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!organization ? (
        <section className="panel">
          <p>Select an organization before managing locations.</p>
        </section>
      ) : (
        <section className="ui-panel">
          <div className="ui-tabs" role="tablist" aria-label="Location type">
            <button
              role="tab"
              aria-selected={tab === "branches"}
              className={tab === "branches" ? "is-active" : ""}
              onClick={() => setTab("branches")}
              type="button"
            >
              Branches <span>{branchTotal}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === "warehouses"}
              className={tab === "warehouses" ? "is-active" : ""}
              onClick={() => setTab("warehouses")}
              type="button"
            >
              Warehouses <span>{warehouseTotal}</span>
            </button>
          </div>
          {tab === "branches" ? (
            <>
              <TableToolbar
                query={branchQuery}
                onQueryChange={(value) => {
                  setBranchQuery(value);
                  setBranchPage(1);
                }}
                queryLabel="Search branches"
                queryPlaceholder="Branch name"
                onClear={() => {
                  setBranchQuery("");
                  setBranchStatus("");
                  setBranchPage(1);
                }}
              >
                <label>
                  Status
                  <select
                    value={branchStatus}
                    onChange={(event) => {
                      setBranchStatus(event.target.value);
                      setBranchPage(1);
                    }}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                    <option value="">All statuses</option>
                  </select>
                </label>
              </TableToolbar>
              <DataTable
                columns={branchColumns}
                rows={branches}
                rowKey={(row) => row.id}
                loading={loading}
                emptyTitle="No branches found"
                emptyDescription="Create a branch or adjust your search and filters."
              />
              <TablePagination
                page={branchPage}
                pageSize={pageSize}
                total={branchTotal}
                loading={loading}
                onPageChange={setBranchPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setBranchPage(1);
                  setWarehousePage(1);
                }}
              />
            </>
          ) : (
            <>
              <TableToolbar
                query={warehouseQuery}
                onQueryChange={(value) => {
                  setWarehouseQuery(value);
                  setWarehousePage(1);
                }}
                queryLabel="Search warehouses"
                queryPlaceholder="Name or warehouse code"
                onClear={() => {
                  setWarehouseQuery("");
                  setWarehouseStatusFilter("");
                  setSelectedBranch("");
                  setWarehousePage(1);
                }}
              >
                <label>
                  Status
                  <select
                    value={warehouseStatus}
                    onChange={(event) => {
                      setWarehouseStatusFilter(event.target.value);
                      setWarehousePage(1);
                    }}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                    <option value="">All statuses</option>
                  </select>
                </label>
                <label>
                  Branch
                  <select
                    value={selectedBranch}
                    onChange={(event) => {
                      setSelectedBranch(event.target.value);
                      setWarehousePage(1);
                    }}
                  >
                    <option value="">All branches</option>
                    {branchOptions.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
              </TableToolbar>
              <DataTable
                columns={warehouseColumns}
                rows={warehouses}
                rowKey={(row) => row.id}
                loading={loading}
                emptyTitle="No warehouses found"
                emptyDescription="Create a warehouse or adjust your search and filters."
              />
              <TablePagination
                page={warehousePage}
                pageSize={pageSize}
                total={warehouseTotal}
                loading={loading}
                onPageChange={setWarehousePage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setBranchPage(1);
                  setWarehousePage(1);
                }}
              />
            </>
          )}
        </section>
      )}

      <Drawer
        open={drawer !== null}
        title={
          drawer?.includes("branch")
            ? `${drawer === "branch-create" ? "Add" : "Edit"} branch`
            : `${drawer === "warehouse-create" ? "Add" : "Edit"} warehouse`
        }
        description="Changes are saved to the active organization."
        onClose={() => !busy && setDrawer(null)}
      >
        <form className="ui-drawer-form" onSubmit={submitForm}>
          {drawer?.includes("branch") ? (
            <>
              <label htmlFor="location-branch-name">Branch name</label>
              <input
                id="location-branch-name"
                minLength={2}
                maxLength={160}
                required
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
              />
              <label htmlFor="location-branch-address">
                Address <span>(optional)</span>
              </label>
              <input
                id="location-branch-address"
                maxLength={500}
                value={branchAddress}
                onChange={(event) => setBranchAddress(event.target.value)}
              />
            </>
          ) : (
            <>
              {branchOptions.length === 0 ? (
                <p>Create or activate a branch before adding a warehouse.</p>
              ) : (
                <>
                  <label htmlFor="location-warehouse-branch">Branch</label>
                  <input
                    id="location-warehouse-branch"
                    list="location-branch-options"
                    required
                    autoComplete="off"
                    placeholder="Search branches"
                    value={warehouseBranchLabel}
                    onChange={(event) => {
                      setWarehouseBranchLabel(event.target.value);
                      setWarehouseBranch(
                        branchOptions.find(
                          (branch) =>
                            branch.name === event.target.value &&
                            (branch.status === "ACTIVE" ||
                              branch.id === editingWarehouse?.branchId),
                        )?.id ?? "",
                      );
                    }}
                  />
                  <datalist id="location-branch-options">
                    {branchOptions
                      .filter(
                        (branch) =>
                          branch.status === "ACTIVE" ||
                          branch.id === editingWarehouse?.branchId,
                      )
                      .map((branch) => (
                        <option key={branch.id} value={branch.name} />
                      ))}
                  </datalist>
                  <label htmlFor="location-warehouse-name">
                    Warehouse name
                  </label>
                  <input
                    id="location-warehouse-name"
                    minLength={2}
                    maxLength={160}
                    required
                    value={warehouseName}
                    onChange={(event) => setWarehouseName(event.target.value)}
                  />
                  <label htmlFor="location-warehouse-code">
                    Warehouse code
                  </label>
                  <input
                    id="location-warehouse-code"
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                    maxLength={40}
                    required
                    value={warehouseCode}
                    onChange={(event) => setWarehouseCode(event.target.value)}
                  />
                </>
              )}
            </>
          )}
          <div className="ui-drawer-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setDrawer(null)}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={
                busy ||
                (drawer?.includes("warehouse") === true &&
                  (!warehouseBranch ||
                    (branchOptions.filter(
                      (branch) => branch.status === "ACTIVE",
                    ).length === 0 &&
                      !editingWarehouse)))
              }
            >
              {busy
                ? "Saving…"
                : drawer?.endsWith("create")
                  ? `Create ${drawer.startsWith("branch") ? "branch" : "warehouse"}`
                  : "Save changes"}
            </button>
          </div>
        </form>
      </Drawer>
      <ConfirmDialog
        open={confirmTarget !== null}
        title={
          confirmTarget?.row.status === "ACTIVE"
            ? `Archive ${confirmTarget.kind === "branches" ? "branch" : "warehouse"}?`
            : `Activate ${confirmTarget?.kind === "branches" ? "branch" : "warehouse"}?`
        }
        description={
          confirmTarget?.row.status === "ACTIVE"
            ? "This location will no longer be available for new operations. Existing records remain unchanged."
            : "This location will become available for new operations again."
        }
        confirmLabel={
          confirmTarget?.row.status === "ACTIVE"
            ? "Archive location"
            : "Activate location"
        }
        busy={busy}
        onConfirm={() => void changeStatus()}
        onCancel={() => setConfirmTarget(null)}
      />
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
