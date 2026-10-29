"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { openLinkedFile } from "@/app/actions";
import belay from "@/components/belay/belay.module.css";
import { None } from "@/components/belay/facts";
import { Prose } from "@/components/content/prose";
import { ProjectMark } from "@/components/project-mark";
import { imagesOf, SentPics, Speaker, str } from "@/components/session/drawer";
import styles from "@/components/session/session.module.css";
import ws from "./workspace.module.css";
import { grillHref } from "../_lib/hrefs";
import type { ClientKind, Composer as ComposerT } from "@/lib/session-kind";
import type { ClientSlots } from "@/lib/slots";
import { cn } from "@/lib/utils";
import info from "../../../../../../extensions/grill/belay.json";
import type { GrillIssue, GrillSearch } from "../_lib/manifest.server";
import type { GrillLive } from "../_lib/runtime.server";
import { GrillIcon, GrillMark } from "./mark";
import { GrillsFound } from "./palette";
import { PendingCommentProvider, usePendingComment, type PendingComment } from "./pending-comment";

const PLAN_READY = /^Plan ready\b/i;

function CommentChip({ comment, onCancel }: { comment: PendingComment; onCancel: () => void }) {
  return (
    <div className={ws.commentChip}>
      <span>
        Comment on <b>Q{comment.q}</b> · <b>{comment.opt === "before" ? "Before" : comment.opt}</b> · <code>{comment.selector}</code>
        {comment.text ? <q>{comment.text}</q> : null}
      </span>
      <button type="button" className={styles.iconBtn} onClick={onCancel} aria-label="Cancel the comment">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

/** Comment mode: a pinned mock element turns the composer's next message into a comment on it. */
function Composer({ children }: { children: (c: ComposerT | null) => React.ReactNode }) {
  const { comment, setComment } = usePendingComment();
  const composer = React.useMemo<ComposerT | null>(() => {
    if (!comment) return null;
    const cancel = () => setComment(null);
    return {
      message: (text) => ({ kind: "comment", ...comment, note: text }),
      placeholder: "What about this element?",
      chip: <CommentChip comment={comment} onCancel={cancel} />,
      cancel,
    };
  }, [comment, setComment]);
  return children(composer);
}

export const client: ClientKind<GrillLive> = {
  id: "grill",
  kind: "grill",
  title: (s) => s.slug,
  place: (s) => s.mark?.name ?? "Unfiled",
  mark: (s) => <ProjectMark mark={s.mark} />,
  entry: (e, { slug }) => {
    if (e.from === "claude" && (e.kind === "reply" || e.kind === "terminal") && PLAN_READY.test(str(e.text))) {
      return (
        <div className={cn(styles.msg, styles.claude)}>
          <Speaker name="Plan ready" className={ws.tagPlan} />
          <div className={cn(styles.bubble, ws.bubblePlan)}>
            <Prose markdown={str(e.text)} compact />
          </div>
        </div>
      );
    }
    if (e.from === "site" && e.kind === "answer") {
      return (
        <div className={styles.event}>
          You picked <b>{str(e.opt)}</b> for Q{String(e.q)}
          {str(e.note) ? <Prose markdown={str(e.note)} compact /> : null}
        </div>
      );
    }
    if (e.from === "site" && e.kind === "comment") {
      return (
        <div className={cn(styles.msg, styles.me)}>
          <Speaker
            me
            name={
              <>
                Comment · Q{String(e.q)} {str(e.opt)} · <code>{str(e.selector)}</code>
              </>
            }
          />
          <SentPics slug={slug} names={imagesOf(e)} />
          <div className={styles.bubble}>
            <Prose markdown={str(e.note)} compact />
          </div>
        </div>
      );
    }
  },
  banner: (link, slug) =>
    link.state === "disconnected" ? (
      <>
        Disconnected: run <code>/grill resume {slug}</code> in the terminal.
      </>
    ) : (
      <>
        No terminal attached. Run <code>/grill resume {slug}</code> in a session started with <code>belay claude</code> to answer from here.
      </>
    ),
  Composer,
  Provider: PendingCommentProvider,
};

export const slots: ClientSlots<GrillSearch, GrillIssue> = {
  id: "grill",
  name: info.name,
  summary: info.summary,
  Mark: GrillMark,
  sectionIcons: { Grills: GrillIcon },
  Found: GrillsFound,
  issueFacts: (id, { grill, plan }, run, pending) => [
    [
      "Grill",
      grill ? (
        <Link href={grillHref(grill)} title={grill}>
          {grill}
        </Link>
      ) : (
        <None />
      ),
    ],
    [
      "Plan",
      plan ? (
        <button type="button" className={belay.linkish} title={plan} onClick={() => run(() => openLinkedFile(id, "plan"))} disabled={pending}>
          {plan.split(/[\\/]/).pop()}
        </button>
      ) : (
        <None />
      ),
    ],
  ],
  issueActions: (id, { plan }) => (plan ? [{ id: "plan", label: "Open plan", run: () => openLinkedFile(id, "plan") }] : []),
};
