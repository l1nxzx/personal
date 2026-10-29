import { Page, PageHeader } from '../../components/shell/PageHeader';
import { DocumentsView } from './DocumentsView';

export default function DocumentsPage() {
  return (
    <Page width="wide">
      <PageHeader title="Documents" />
      <DocumentsView />
    </Page>
  );
}
