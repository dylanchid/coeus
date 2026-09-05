"use client";

import { useState } from "react";

export function AlreadyArchivedButton() {
  return <button type="button" disabled aria-disabled="true">Saved</button>;
}

export function PreviewFollowButton({ initialPreviewing = false }: { initialPreviewing?: boolean }) {
  const [previewing, setPreviewing] = useState(initialPreviewing);
  return (
    <button
      type="button"
      aria-pressed={previewing}
      onClick={() => setPreviewing((current) => !current)}
    >
      {previewing ? "Previewing" : "Preview follow"}
    </button>
  );
}
