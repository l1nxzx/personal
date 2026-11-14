import { cn } from '../../lib/cn';
import { useNow } from './sdk/dates';

/**
 * The built-in clock: the time large and the date above it, straight on the wallpaper, like a
 * phone's home screen. `ink` is the wallpaper's label colour class.
 */
export function ClockWidget({ ink }: { ink: string }) {
  const now = useNow(10_000);
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return (
    <div className={cn('flex h-full flex-col justify-center px-3 pb-2 pt-5', ink)}>
      <p className="text-[0.8125rem] font-medium tracking-wide opacity-85">{date}</p>
      <p
        className="mt-0.5 font-serif text-[3.25rem] font-light leading-none tracking-tight tabular-nums"
        data-testid="clock-time"
      >
        {time}
      </p>
    </div>
  );
}
