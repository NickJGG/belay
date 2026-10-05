import Link from 'next/link';
import { PageBar } from '@/components/PageBar';
import ui from '@/components/ui.module.css';

export default function NotFound() {
  return (
    <>
      <PageBar crumbs={[{ label: 'Not found' }]} />
      <div className={ui.page}>
        <p className={ui.empty}>
          <Link className={ui.link} href="/">
            Back home
          </Link>
        </p>
      </div>
    </>
  );
}
