import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "../ui/page-header";
import { StatusBadge } from "../ui/status-badge";

export type Breadcrumb = { label: string; href?: string };

export function DocumentHeader({
  eyebrow,
  title,
  reference,
  description,
  breadcrumbs,
  status,
  action,
}: {
  eyebrow: string;
  title: string;
  reference?: string;
  description?: string;
  breadcrumbs: Breadcrumb[];
  status?: string;
  action?: ReactNode;
}) {
  return (
    <>
      <nav className="document-breadcrumbs" aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`}>
            {index ? <span aria-hidden="true"> / </span> : null}
            {crumb.href ? (
              <Link href={crumb.href}>{crumb.label}</Link>
            ) : (
              crumb.label
            )}
          </span>
        ))}
      </nav>
      <PageHeader
        eyebrow={eyebrow}
        title={reference ? `${title} ${reference}` : title}
        description={description}
        action={
          <div className="document-header-actions">
            {status ? <StatusBadge status={status} /> : null}
            {action}
          </div>
        }
      />
    </>
  );
}
