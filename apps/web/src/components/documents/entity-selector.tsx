"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "../../features/auth/session-provider";

export type SelectableEntity = {
  id: string;
  name: string;
  code?: string;
  email?: string | null;
};
type Page = { data: SelectableEntity[]; total: number };

export function EntitySelector({
  endpoint,
  label,
  value,
  onSelect,
  required = false,
  excludeIds = [],
  searchHint = "Search by name",
}: {
  endpoint: string;
  label: string;
  value: SelectableEntity | null;
  onSelect: (entity: SelectableEntity | null) => void;
  required?: boolean;
  excludeIds?: string[];
  searchHint?: string;
}) {
  const { organization, authenticatedRequest } = useSession();
  const id = useId();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SelectableEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const requestVersion = useRef(0);
  const organizationId = organization?.id ?? "";
  const selectedOrganization = useRef(organizationId);
  const shownResults = results.filter((row) => !excludeIds.includes(row.id));

  useLayoutEffect(() => {
    if (selectedOrganization.current === organizationId) return;
    selectedOrganization.current = organizationId;
    requestVersion.current += 1;
  }, [organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const version = ++requestVersion.current;
    if (!organizationId || !open) return;
    // Reflect the pending request; response updates are guarded by request generation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      page_size: "20",
      status: "ACTIVE",
    });
    if (search) params.set("q", search);
    void authenticatedRequest<Page>(`${endpoint}?${params}`)
      .then((result) => {
        if (
          version !== requestVersion.current ||
          selectedOrganization.current !== organizationId
        )
          return;
        setResults(result.data);
        setTotal(result.total);
        setActiveIndex(0);
      })
      .catch((cause: unknown) => {
        if (
          version !== requestVersion.current ||
          selectedOrganization.current !== organizationId
        )
          return;
        setResults([]);
        setTotal(0);
        setError(
          cause instanceof Error
            ? cause.message
            : `${label} results could not be loaded.`,
        );
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
    return () => {
      requestVersion.current += 1;
    };
  }, [
    authenticatedRequest,
    endpoint,
    label,
    open,
    organizationId,
    page,
    search,
  ]);

  useEffect(() => {
    if (selectedOrganization.current === organizationId) return;
    selectedOrganization.current = organizationId;
    requestVersion.current += 1;
    setResults([]);
    setQuery("");
    setPage(1);
    setOpen(false);
    onSelect(null);
  }, [onSelect, organizationId]);
  useEffect(() => {
    // Keep the display text in sync with the selected entity supplied by the parent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (value && !open) setQuery(value.name);
    else if (!value && !open) setQuery("");
  }, [open, value]);

  function choose(entity: SelectableEntity) {
    onSelect(entity);
    setQuery(entity.name);
    setOpen(false);
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        Math.max(0, Math.min(current + 1, shownResults.length - 1)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && open && shownResults[activeIndex]) {
      event.preventDefault();
      choose(shownResults[activeIndex]);
    } else if (event.key === "Escape") setOpen(false);
  }

  return (
    <div className="entity-selector">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className="product-selector-control">
        <input
          id={id}
          role="combobox"
          aria-required={required}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && shownResults[activeIndex]
              ? `${id}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          placeholder={searchHint}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
            setOpen(true);
            if (value) onSelect(null);
          }}
          onKeyDown={onKeyDown}
        />
        {value ? (
          <button
            className="product-selector-clear"
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              onSelect(null);
              setQuery("");
              setOpen(true);
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="product-selector-popover">
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label={`${label} options`}
          >
            {loading ? <li role="status">Searching…</li> : null}
            {!loading && !error && !shownResults.length ? (
              <li role="status">No matching active {label.toLowerCase()}.</li>
            ) : null}
            {shownResults.map((entity, index) => (
              <li key={entity.id} role="presentation">
                <button
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(entity)}
                >
                  <strong>{entity.name}</strong>
                  <span>{entity.code ?? entity.email ?? "Active record"}</span>
                </button>
              </li>
            ))}
          </ul>
          {error ? <p role="alert">{error}</p> : null}
          {total > 20 ? (
            <div className="product-selector-pagination">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(total / 20) || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
