# Belay

One local app for a developer's projects, design grills and courses, each worked through Claude Code sessions with a browser view beside them.

## Language

### Claude work

**Session**:
One Claude Code conversation, from launch until quit or `/clear`.
_Avoid_: transcript (for this meaning)

**Grill**:
A persisted `/grill` interview (`~/Belay/grills/<slug>/`), which can span several Sessions.
_Avoid_: grill session, session (for this meaning)

**Lesson**:
One sitting of a Course's lesson routine on one Topic, inside a Session.
_Avoid_: session (for this meaning)

**Build**:
A Session working on a project's Issues, with no Grill or Lesson.

**Extension**:
An optional part of the app beyond projects and Issues: grill (Grills) or learn (Courses and Lessons), switched on and off in `settings.yaml` or on the Settings page. While it's off, its pages, nav, palette and search entries, home and project sections, issue facts and actions, In flight group and Tabs are gone; its data isn't.

**Extension mark**:
An Extension's icon, drawn like the Belay mark (one heavy run-on stroke and a dot): grill's open flame, learn's open book. In the Dusk gradient only on the Settings page while it's on; elsewhere in its row's colour, or its course's on a Lesson's Tab.
_Avoid_: logo, project mark (for this meaning)

**Settings**:
The `/settings` page, opened from the cog at the sidebar's foot: Appearance (Glow, saved per browser) and a card for each bundled Extension: an installed one with its switch and Uninstall, an uninstalled one greyed with Install. Installing or uninstalling rebuilds the site.

### Shell

**Tab**:
A live Grill or Lesson in the strip above the page, showing its turn dot, its project mark (a Lesson: its course's book) and title. One not yet opened in this browser shows **New**, until it's clicked or its page is visited; reattaching never brings it back.
_Avoid_: live card

**Drawer**:
The docked conversation panel showing the selected Tab, on every page while a Tab is live.

**Strip**:
The narrow layout's bar for the selected Tab, above the bottom dock.

**In flight**:
Every `doing` Issue plus every in-progress Grill not yet linked to an Issue.

**Workspace**:
A page you work in rather than read (a Grill, a Lesson, a Course's Work). A Lesson or Work opens with the sidebar collapsed to the rail; a Grill shows its Outline instead.
_Avoid_: session page

**Outline**:
A Grill Workspace's left pane, in place of the sidebar: the app nav, its questions and the selected question's options. Collapsible to a column of question numbers. On a phone it opens as a sheet from the stage header's "Qn of N".

**Overview**:
A Grill's first view, a status card (status, decided count, where it stands, its issues) opened from the Outline's head row, and the one a settled Grill opens on.

**Reading page**:
Any page that isn't a Workspace (Home, Projects, an Issue, a Course's tabs), which opens with the sidebar expanded.

**Whiteboard**:
A Course's `now.md`, which Claude rewrites with notation during a Lesson and which fills the Lesson's Workspace.
_Avoid_: Now page

## Relationships

- A **Grill** spans one or more **Sessions**; a **Session** belongs to at most one **Grill**
- A **Session** holds zero or more **Lessons**
- A **Build** is a **Session** with neither a **Grill** nor a **Lesson**, so it gets no **Tab**
- Each live **Grill** or **Lesson** has exactly one **Tab**; the **Drawer** shows one **Tab** at a time

## Example dialogue

> **Dev:** "Nick resumed yesterday's **Grill** this morning. Is that a second **Grill**?"
> **Domain expert:** "No: one **Grill**, two **Sessions**. The project's Grills list shows it once, and the **Tab** is the same **Grill** reattached."
