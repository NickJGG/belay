'use client';
import { Plus } from 'lucide-react';
import { useKeys } from './Keys';
import ui from './ui.module.css';

export function LogButton() {
  const keys = useKeys();
  return (
    <button type="button" className={ui.btn} title="Log work (L)" onClick={() => keys?.newLog()}>
      <Plus size={12} aria-hidden />
      Log
    </button>
  );
}
