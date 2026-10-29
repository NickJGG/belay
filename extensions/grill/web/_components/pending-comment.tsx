"use client";

import * as React from "react";
import { useLive } from "@/components/live/live-provider";

/** A mock element pinned in comment mode, waiting for its note in the composer. */
export type PendingComment = { q: number; opt: string; selector: string; text: string };

type Pending = { comment: PendingComment | null; setComment: (c: PendingComment | null) => void };

const PendingContext = React.createContext<Pending>({ comment: null, setComment: () => {} });

/** The comment pinned on the selected grill's mock, dropped when the selection changes. */
export function PendingCommentProvider({ children }: { children: React.ReactNode }) {
  const slug = useLive().selected?.slug ?? null;
  const [comment, setComment] = React.useState<PendingComment | null>(null);
  const [commentFor, setCommentFor] = React.useState(slug);
  if (commentFor !== slug) {
    setCommentFor(slug);
    setComment(null);
  }
  const value = React.useMemo(() => ({ comment, setComment }), [comment]);
  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>;
}

export const usePendingComment = () => React.useContext(PendingContext);
