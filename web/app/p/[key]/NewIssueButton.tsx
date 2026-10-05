'use client';
import { Plus } from 'lucide-react';
import { Kbd } from '@/components/Kbd';
import { useKeys } from '@/components/Keys';
import ui from '@/components/ui.module.css';

export function NewIssueButton({ className }: { className: string }) {
  const keys = useKeys();
  return (
    <button type="button" className={`${ui.btn} ${className}`} onClick={() => keys?.newIssue()}>
      <Plus size={13} aria-hidden />
      New issue
      <Kbd>C</Kbd>
    </button>
  );
}
