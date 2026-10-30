"use client";

import { useCallback, useState } from "react";
import type { Topic } from "@/lib/feeds/sources";
import type { UserPrefs } from "@/lib/types";

/** Reader session topic is local; preference edits use the provider's persistence queue. */
export function useNewsPrefs(updatePrefs: (patch: Partial<UserPrefs>) => void) {
  const [topic, setTopic] = useState<Topic>("all");
  const persist = useCallback((patch: Partial<UserPrefs>) => updatePrefs(patch), [updatePrefs]);
  const changeTopic = useCallback((nextTopic: Topic) => setTopic(nextTopic), []);
  const onSearchChange = useCallback((value: string) => persist({ lastSearch: value }), [persist]);

  return { topic, persist, changeTopic, onSearchChange };
}
