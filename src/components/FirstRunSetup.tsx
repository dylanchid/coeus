"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { mergeWithDefaults, readStoredPrefsSnapshot } from "@/lib/prefs";
import {
  applyTopicPicks,
  dismissSetupHint,
  readSetupRecord,
  shouldOfferSetup,
  shouldShowSetupHint,
  writeSetupRecord,
  type SetupRecord,
} from "@/lib/setup/firstRun";
import { getSource } from "@/lib/feeds/sources";
import { SETUP_TOPIC_AREAS } from "@/lib/setup/setupTopics";
import type { UserPrefs } from "@/lib/types";
import type { AuthStatus } from "./AuthProvider";
import type { Profile } from "@/lib/profiles/profile";
import { SignInPanel } from "./SignInPanel";
import { UiButton } from "./ui/Button";

export function useFirstRunSetupGate(
  prefs: UserPrefs | null,
  authStatus: AuthStatus,
  profile: Profile | null
): { setupOpen: boolean; hintVisible: boolean; refresh(): void } {
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  return useMemo(() => {
    if (typeof window === "undefined" || !prefs || authStatus === "loading") {
      return { setupOpen: false, hintVisible: false, refresh };
    }
    const storage = window.localStorage;
    const setupRaw = storage.getItem("coeus.setup.v1");
    const record = readSetupRecord(storage);
    const snapshot = readStoredPrefsSnapshot(storage);
    let mergedPrefs: UserPrefs | null = null;
    let storedPrefsParseable = true;
    if (snapshot.hasStoredPrefs) {
      if (!snapshot.raw) {
        storedPrefsParseable = false;
      } else {
        try {
          mergedPrefs = mergeWithDefaults(JSON.parse(snapshot.raw) as Partial<UserPrefs>);
        } catch {
          storedPrefsParseable = false;
        }
      }
    } else {
      mergedPrefs = mergeWithDefaults(null);
    }

    const setupOpen = shouldOfferSetup({
      setupRaw,
      hasStoredPrefs: snapshot.hasStoredPrefs,
      hasLegacyBareagaKey: snapshot.hasLegacyBareagaKey,
      hasLegacyBrpKey: snapshot.hasLegacyBrpKey,
      storedPrefsParseable,
      mergedPrefs,
      signedInWithProfile: authStatus === "ready" && profile !== null,
    });

    return {
      setupOpen,
      hintVisible: shouldShowSetupHint(record),
      refresh,
    };
    // `tick` forces a recompute after setup state is written to localStorage.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is an intentional refresh latch
  }, [prefs, authStatus, profile, tick, refresh]);
}

export function FirstRunSetup({
  open,
  prefs,
  onUpdatePrefs,
  onFinished,
}: {
  open: boolean;
  prefs: UserPrefs;
  onUpdatePrefs(update: Partial<UserPrefs>): void;
  onFinished(): void;
}) {
  const searchParams = useSearchParams();
  const dialogRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState<1 | 2>(() => {
    const record = readSetupRecord();
    return record?.status === "in_progress" && record.step === 2 ? 2 : 1;
  });
  const [selectedAreas, setSelectedAreas] = useState<string[]>(() => readSetupRecord()?.topicAreaIds ?? []);
  const topicAreasRef = useRef<string[]>(selectedAreas);

  useEffect(() => {
    if (searchParams.get("setup") !== "done") return;
    const existing = readSetupRecord();
    const topicAreaIds = existing?.topicAreaIds ?? topicAreasRef.current;
    writeSetupRecord({
      version: 1,
      status: "done",
      topicAreaIds,
      hintDismissed: false,
    });
    onFinished();
    const url = new URL(window.location.href);
    url.searchParams.delete("setup");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [searchParams, onFinished]);

  const finish = useCallback(
    (status: "skipped" | "done", topicAreaIds: string[] | undefined, showHint: boolean) => {
      writeSetupRecord({
        version: 1,
        status,
        topicAreaIds,
        hintDismissed: status === "skipped" || !showHint,
      });
      onFinished();
    },
    [onFinished]
  );

  const skipSetup = useCallback(
    (status: "skipped" | "done") => {
      finish(status, status === "done" ? topicAreasRef.current : undefined, status === "done");
    },
    [finish]
  );

  const onClose = useCallback(() => {
    if (step === 1) skipSetup("skipped");
    else skipSetup("done");
  }, [skipSetup, step]);

  useModalDialog({ active: open, containerRef: dialogRef, onClose });

  const toggleArea = (areaId: string) => {
    setSelectedAreas((current) => {
      const next = current.includes(areaId)
        ? current.filter((id) => id !== areaId)
        : [...current, areaId];
      topicAreasRef.current = next;
      return next;
    });
  };

  const continueTopics = () => {
    if (!selectedAreas.length) return;
    topicAreasRef.current = selectedAreas;
    const next = applyTopicPicks(prefs, selectedAreas);
    onUpdatePrefs(next);
    writeSetupRecord({
      version: 1,
      status: "in_progress",
      step: 2,
      topicAreaIds: selectedAreas,
    });
    setStep(2);
  };

  if (!open) return null;

  return (
    <div className="first-run-backdrop">
      <section
        ref={dialogRef}
        className="first-run-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={step === 1 ? "first-run-topics-heading" : "first-run-handle-heading"}
        tabIndex={-1}
      >
        {step === 1 ? (
          <>
            <header className="first-run-head">
              <h1 id="first-run-topics-heading">Pick a few worlds to start with</h1>
              <p className="first-run-lede">
                Choose subject areas. Each one adds a handful of starter sources to your Reader. No account needed.
              </p>
            </header>
            <div className="first-run-topics" role="group" aria-label="Subject areas">
              {SETUP_TOPIC_AREAS.map((area) => {
                const pressed = selectedAreas.includes(area.id);
                return (
                  <article key={area.id} className="first-run-topic" data-pressed={pressed ? "true" : "false"}>
                    <button
                      type="button"
                      className="first-run-topic-toggle"
                      aria-pressed={pressed}
                      onClick={() => toggleArea(area.id)}
                    >
                      <span className="first-run-topic-label">{area.label}</span>
                      <span className="first-run-topic-count">{area.sourceIds.length} starter sources</span>
                    </button>
                    <ul className="first-run-topic-sources">
                      {area.sourceIds.map((id) => (
                        <li key={id}>{getSource(id)?.name ?? id}</li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
            <footer className="first-run-actions">
              <UiButton type="button" variant="unstyled" className="first-run-skip" onClick={() => skipSetup("skipped")}>
                Skip, just read
              </UiButton>
              <UiButton
                type="button"
                className="first-run-continue"
                disabled={!selectedAreas.length}
                onClick={continueTopics}
              >
                Continue
              </UiButton>
            </footer>
          </>
        ) : (
          <>
            <header className="first-run-head">
              <h1 id="first-run-handle-heading">Claim an @handle</h1>
              <p className="first-run-lede">
                Your collections get an address: <span className="first-run-address">coeus.com/@____</span>
              </p>
              <p className="first-run-lede">
                Sign in when you are ready. Reading never needs an account.
              </p>
            </header>
            <div className="first-run-signin">
              <SignInPanel next="/?setup=done" compact />
            </div>
            <footer className="first-run-actions">
              <UiButton type="button" variant="unstyled" className="first-run-skip" onClick={() => skipSetup("done")}>
                Skip, just read
              </UiButton>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

export function FirstRunReaderHint({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss(): void;
}) {
  if (!visible) return null;
  return (
    <div className="first-run-hint" role="status">
      <p>Save anything worth keeping → it becomes a collection</p>
      <button type="button" className="first-run-hint-dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

export function dismissFirstRunHint(): SetupRecord | null {
  const existing = readSetupRecord();
  if (!existing) return null;
  const next = dismissSetupHint(existing);
  writeSetupRecord(next);
  return next;
}