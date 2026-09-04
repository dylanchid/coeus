import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import type { AppSection } from "./PrimaryNav";

export function AppShell({
  section,
  subline,
  footerNote,
  children,
}: {
  section: AppSection;
  subline?: ReactNode;
  footerNote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <SiteHeader section={section} subline={subline} />
      {children}
      <SiteFooter note={footerNote} />
    </div>
  );
}
