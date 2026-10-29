"use client";

import * as React from "react";
import { sendTo, useLive } from "@/components/live/live-provider";
import { isLesson } from "../../../../_lib/lesson";
import { WorkSpace, type SendToLesson } from "./work-editor";

/** The Work tab, sending to the course's live lesson: an attempt (`work/…` to read), or Done as a chat. */
export function LiveWorkSpace(props: Omit<React.ComponentProps<typeof WorkSpace>, "send">) {
  const { live } = useLive();
  const slug = live.find((l) => isLesson(l) && l.course === props.course && l.connected)?.slug;
  const send = React.useMemo<SendToLesson | undefined>(() => {
    if (!slug) return undefined;
    return async (text, opts) => !(await sendTo(slug, opts ? { kind: "attempt", path: opts.path, text } : { kind: "chat", text }));
  }, [slug]);
  return <WorkSpace {...props} send={send} />;
}
