import type { ReactNode } from "react";

export function DocumentLayout({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={aside ? "document-layout has-aside" : "document-layout"}>
      <div className="document-main">{children}</div>
      {aside ? <aside className="document-aside">{aside}</aside> : null}
    </div>
  );
}
