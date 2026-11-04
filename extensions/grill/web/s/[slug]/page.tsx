import { notFound } from "next/navigation";
import { Prose } from "@/components/content/prose";
import { ShellSlot } from "@/components/layout/shell-slot";
import { projectColor } from "@/components/project-mark";
import { SessionWorkspace, type SessionNav } from "../../_components/workspace";
import { sessionDetail } from "../../_lib/detail.server";
import { navData } from "@/lib/data";
import { UNFILED } from "../../_lib/manifest";
import { shortDate, statusLabel } from "@/lib/format";
import type { SessionDoc } from "../../_lib/session-doc";
import { cn } from "@/lib/utils";
import styles from "@/app/page.module.css";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug} • Belay` };
}

export default async function SessionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [detail, nav] = await Promise.all([sessionDetail(slug), navData()]);
  if (!detail) notFound();
  const { session: s, live } = detail;
  const sessionNav: SessionNav = {
    slug: s.slug,
    topic: s.topic,
    project: s.project,
    mark: detail.mark,
    status: s.status,
    live: nav.live.some((l) => l.slug === s.slug),
    questions: s.questions,
    back: `/p/${detail.mark?.key ?? UNFILED}`,
  };

  if (detail.legacy) {
    return (
      <div className={cn(styles.page, styles.legacy)}>
        <ShellSlot project={{ key: detail.mark?.key ?? UNFILED, name: detail.mark?.name ?? "Unfiled" }} section="Grills" glow={detail.mark ? projectColor(detail.mark) : undefined} />
        <header className={styles.header}>
          <h1 className={styles.title}>{s.topic}</h1>
          <p className={styles.meta}>
            {[detail.projectName ?? s.project, statusLabel(s.status), s.updated && `updated ${shortDate(s.updated)}`, "legacy grill session"]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {detail.legacy.preview ? (
            <p>
              <a className={styles.legacyLink} href={`/legacy/sessions/${s.slug}/preview.html`} target="_blank" rel="noreferrer">
                Open legacy preview ↗
              </a>
            </p>
          ) : null}
        </header>
        <Prose markdown={detail.legacy.markdown} />
      </div>
    );
  }

  // A session attached before its first save has only bridge.json; a session.json mid-write doesn't parse.
  const doc: SessionDoc = detail.doc ?? {
    slug: s.slug,
    topic: s.topic,
    status: s.status,
    project: s.project,
    open: s.open,
    mock: null,
    questions: [],
  };

  return <SessionWorkspace doc={doc} issues={detail.issues} files={detail.files} live={live} nav={sessionNav} />;
}
