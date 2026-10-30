export function ReaderReturnBar({ show, statusText }: { show: boolean; statusText: string }) {
  if (!show) return null;
  return <div className="reader-return-bar" role="region" aria-label="Reader position">
    <span>{statusText}</span>
    <button
      type="button"
      onClick={() => window.scrollTo({
        top: 0,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      })}
    >
      Back to top ↑
    </button>
  </div>;
}
