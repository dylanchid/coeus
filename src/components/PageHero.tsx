import type { ReactNode } from "react";

export function PageHero({
  kicker,
  title,
  lede,
  actions,
  labelledById,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  labelledById?: string;
}) {
  return (
    <section className="page-hero" aria-labelledby={labelledById}>
      {kicker ? <p className="page-hero-kicker">{kicker}</p> : null}
      <div className="page-hero-body">
        <h1 className="page-hero-title" id={labelledById}>
          {title}
        </h1>
        {lede || actions ? (
          <div className="page-hero-aside">
            {lede ? <p className="page-hero-lede">{lede}</p> : null}
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
