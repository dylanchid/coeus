import type { ReactNode } from "react";

export function SiteFooter({ note }: { note?: ReactNode }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-main">
        <p>Bareaga — a personal front page for the open web.</p>
        <p>
          Standalone RSS reader, inspired by{" "}
          <a href="https://brutalist.report/" target="_blank" rel="noreferrer">
            brutalist.report
          </a>
          . Not affiliated.
        </p>
      </div>
      {note ? <p className="site-footer-note">{note}</p> : null}
    </footer>
  );
}
