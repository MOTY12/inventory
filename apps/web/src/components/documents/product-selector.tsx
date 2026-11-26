"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "../../features/auth/session-provider";

export type SelectableProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  baseUnitId: string;
  baseUnit: { id: string; code: string; name: string; precision?: number };
  unitConversions?: {
    unitId: string;
    baseQuantity: string;
    unit: { id: string; code: string; name: string; precision?: number };
  }[];
  defaultSalePrice?: string | null;
  saleCurrency?: string | null;
  type?: string;
  trackInventory?: boolean;
};
type Result = { data: SelectableProduct[]; total: number };

export function ProductSelector({
  value,
  label = "Product",
  onSelect,
}: {
  value: SelectableProduct | null;
  label?: string;
  onSelect: (product: SelectableProduct | null) => void;
}) {
  const { organization, authenticatedRequest } = useSession();
  const id = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SelectableProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    const version = ++requestVersion.current;
    if (!organization || !open) return;
    // The request lifecycle is asynchronous; this state reflects the pending network call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      page_size: "20",
      status: "ACTIVE",
    });
    if (debounced) params.set("q", debounced);
    void authenticatedRequest<Result>(
      `/organizations/current/catalog/products?${params}`,
    )
      .then((result) => {
        if (version !== requestVersion.current) return;
        setResults(result.data);
        setTotal(result.total);
        setActiveIndex(0);
      })
      .catch((cause: unknown) => {
        if (version !== requestVersion.current) return;
        setResults([]);
        setTotal(0);
        setError(
          cause instanceof Error
            ? cause.message
            : "Products could not be loaded.",
        );
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
    return () => {
      requestVersion.current += 1;
    };
  }, [authenticatedRequest, debounced, open, organization, page]);

  useEffect(() => {
    // Synchronize the text input with the externally selected product.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (value && !open) setQuery(`${value.name} · ${value.sku}`);
    if (!value && !open) setQuery("");
  }, [value, open]);

  function choose(product: SelectableProduct) {
    onSelect(product);
    setQuery(`${product.name} · ${product.sku}`);
    setOpen(false);
  }
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) =>
        Math.max(0, Math.min(index + 1, results.length - 1)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="product-selector">
      <label htmlFor={id}>{label}</label>
      <div className="product-selector-control">
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && results[activeIndex]
              ? `${id}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          value={query}
          placeholder="Search by name, SKU, or barcode"
          onFocus={() => {
            setOpen(true);
            setPage(1);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
            setOpen(true);
            if (value) onSelect(null);
          }}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button
            className="product-selector-clear"
            type="button"
            aria-label="Clear selected product"
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
          <ul id={`${id}-options`} role="listbox" aria-label="Products">
            {loading ? <li role="status">Searching products…</li> : null}
            {!loading && !error && results.length === 0 ? (
              <li role="status">No matching active products.</li>
            ) : null}
            {results.map((product, index) => (
              <li key={product.id} role="presentation">
                <button
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(product)}
                >
                  <strong>{product.name}</strong>
                  <span>
                    {product.sku} · {product.baseUnit.code}
                  </span>
                  {product.barcode ? (
                    <small>Barcode {product.barcode}</small>
                  ) : null}
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
