import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../components/shell/PageHeader';

export default function NotFoundPage() {
  return (
    <Page width="narrow">
      <PageHeader title="Not found" />
      <p className="mt-2 text-ink-muted">
        There&apos;s nothing at this address.{' '}
        <Link to="/" className="text-accent hover:underline hover:underline-offset-2">
          Go home
        </Link>
      </p>
    </Page>
  );
}
