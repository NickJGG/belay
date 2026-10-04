import Link from 'next/link';
import ui from '@/components/ui.module.css';

export default function NotFound() {
  return (
    <div className={ui.page}>
      <h1 className={ui.title}>Not found</h1>
      <p className={ui.empty}>
        <Link className={ui.link} href="/">
          Back home
        </Link>
      </p>
    </div>
  );
}
