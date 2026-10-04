'use client';
import { useTransition } from 'react';
import { updateProject } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import type { Project } from '@/lib/types';
import styles from './page.module.css';

export function ProjectEdit({ project }: { project: Project }) {
  const [pending, start] = useTransition();
  return (
    <details className={ui.disclosure}>
      <summary>Edit project</summary>
      <form
        key={`${project.name}|${project.group}|${project.status}`}
        className={styles.edit}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          start(async () => {
            const r = await updateProject(project.key, data.get('name'), data.get('group'), data.get('status'));
            if (r.error) toastError(r.error);
          });
        }}
      >
        <label>
          Name
          <input className={ui.input} name="name" defaultValue={project.name} required />
        </label>
        <label>
          Group
          <input className={ui.input} name="group" defaultValue={project.group ?? ''} placeholder="none" />
        </label>
        <label>
          Status
          <select className={ui.input} name="status" defaultValue={project.status}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <button type="submit" className={`${ui.primary} ${styles.save}`} disabled={pending}>
          Save
        </button>
      </form>
    </details>
  );
}
