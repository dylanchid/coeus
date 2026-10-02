"use client";

import { useState } from "react";

type Props = {
  /** 0 means unrated; otherwise 0.5–5 in half steps. */
  value: number;
  onChange: (value: number) => void;
  label: string;
  size?: "regular" | "compact";
};

const STAR_PATH = "M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 17.9l-6.4 3.6L7 14.3l-5.3-5 7.2-.9z";

function StarShape({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={STAR_PATH} />
    </svg>
  );
}

/** The filled star is cropped by an overflow-hidden box, so a half star is exact and needs no shared SVG ids. */
function Star({ fill }: { fill: number }) {
  return (
    <>
      <StarShape className="star-empty" />
      {fill > 0 ? <span className="star-crop" style={{ width: `${fill * 100}%` }}><StarShape className="star-full" /></span> : null}
    </>
  );
}

/**
 * Five clickable stars with half-star precision. Each star is split into a left
 * (n − 0.5) and right (n) hit target; clicking the current value clears it.
 */
export function StarRating({ value, onChange, label, size = "regular" }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div className={`star-rating is-${size}`} role="group" aria-label={label} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span className="star-rating-star" key={star}>
          <Star fill={Math.min(1, Math.max(0, shown - (star - 1)))} />
          {[star - 0.5, star].map((half) => (
            <button
              key={half}
              type="button"
              className={half === star ? "is-right" : "is-left"}
              aria-label={`${half} ${half === 1 ? "star" : "stars"}`}
              aria-pressed={value === half}
              onMouseEnter={() => setHover(half)}
              onFocus={() => setHover(half)}
              onBlur={() => setHover(null)}
              onClick={() => onChange(value === half ? 0 : half)}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
