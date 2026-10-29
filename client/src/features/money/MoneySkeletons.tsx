import { Skeleton, SkeletonText, skeletonWidth } from '../../components/ui/Skeleton';

/** A figure that isn't known yet, sized by the type it sits in. */
export function Pending({ width }: { width: string }) {
  return (
    <Skeleton>
      <SkeletonText width={width} />
    </Skeleton>
  );
}

/** Income and expense history while loading: a month heading over dated rows. */
export function HistorySkeleton() {
  return (
    <Skeleton className="mt-4">
      <SkeletonText className="mb-1 text-[0.8125rem] font-medium" width="6.5rem" />
      <ul className="divide-y divide-line/70 border-y border-line/70">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-baseline gap-3 py-2.5">
            <SkeletonText className="w-16 shrink-0 text-2xs" width="2.75rem" />
            <SkeletonText className="min-w-0 flex-1 text-[0.9375rem]" width={skeletonWidth(i)} />
            <SkeletonText className="shrink-0 text-[0.9375rem]" width="4rem" />
          </li>
        ))}
      </ul>
    </Skeleton>
  );
}
