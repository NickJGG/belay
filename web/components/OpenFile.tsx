'use client';
import { useTransition } from 'react';
import type { Result } from '@/app/actions';
import panel from './PropsPanel.module.css';
import { toastError } from './Toaster';

/** `open` is a server action bound to the record, so the path the server opens never comes from the client. */
export function OpenFile({ path, open }: { path: string; open: () => Promise<Result> }) {
  const [pending, start] = useTransition();
  const click = () =>
    start(async () => {
      const r = await open();
      if (r.error) toastError(r.error);
    });

  return (
    <button type="button" className={panel.fileLink} title={path} onClick={click} disabled={pending}>
      {path.split(/[\\/]/).pop()}
    </button>
  );
}
