import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../components/shell/PageHeader';
import { useUI } from '../context/UIContext';

/** Sections that are planned but not built yet. Says so plainly. */
export default function LaterPage({ title, about }: { title: string; about: string }) {
  const { openCapture } = useUI();
  return (
    <Page width="narrow">
      <PageHeader title={title} />
      <div className="mt-4 max-w-prose space-y-4 text-[0.9375rem] leading-7 text-ink-muted">
        <p>{about}</p>
        <p className="text-ink-faint">
          This section isn&apos;t built yet. Until it is,{' '}
          <button
            type="button"
            onClick={() => openCapture()}
            className="text-accent hover:underline hover:underline-offset-2"
          >
            capture
          </button>{' '}
          anything meant for it. It will wait in your{' '}
          <Link to="/inbox" className="text-accent hover:underline hover:underline-offset-2">
            inbox
          </Link>
          .
        </p>
      </div>
    </Page>
  );
}
