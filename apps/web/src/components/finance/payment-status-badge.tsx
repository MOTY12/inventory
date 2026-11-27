const labels: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

export function PaymentStatusBadge({
  status,
  overdue = false,
}: {
  status: string;
  overdue?: boolean;
}) {
  const value = overdue ? "OVERDUE" : status;
  const tone =
    value === "PAID"
      ? "positive"
      : value === "OVERDUE" || value === "PARTIALLY_PAID"
        ? "warning"
        : "neutral";
  return (
    <span className={`ui-status-badge ui-status-${tone}`}>
      {labels[value] ?? value.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
