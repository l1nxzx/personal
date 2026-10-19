import { TabLinks } from '../../components/ui/misc';

/** Money & Work sub-sections. */
export function MoneyTabs() {
  return (
    <div className="mt-4">
      <TabLinks
        tabs={[
          { to: '/money', label: 'Income', end: true },
          { to: '/money/expenses', label: 'Expenses' },
          { to: '/money/ideas', label: 'Ideas' },
        ]}
      />
    </div>
  );
}
