const labels: Record<string, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  DRAFT: "Draft",
  ISSUED: "Issued",
  VOID: "Void",
  REVERSED: "Reversed",
  POSTED: "Posted",
  SUBMITTED: "Submitted",
  PARTIALLY_RECEIVED: "Partially received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
  CONFIRMED: "Confirmed",
  FULFILLED: "Fulfilled",
  PARTIALLY_FULFILLED: "Partially fulfilled",
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE" || status === "RECEIVED" || status === "FULFILLED"
      ? "positive"
      : status === "ARCHIVED" ||
          status === "CANCELLED" ||
          status === "VOID" ||
          status === "REVERSED"
        ? "muted"
        : status.includes("PARTIALLY")
          ? "warning"
          : "neutral";
  const label = labels[status] ?? status.toLowerCase().replaceAll("_", " ");

  return <span className={`ui-status-badge ui-status-${tone}`}>{label}</span>;
}
