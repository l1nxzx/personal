const nf = new Intl.NumberFormat();

export const formatNumber = (n: number) => nf.format(n);

export const plural = (n: number, word: string, words = `${word}s`) =>
  `${nf.format(n)} ${n === 1 ? word : words}`;

/** "41 h 12 min", "12 min", "under a minute". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 min';
  if (seconds < 60) return 'under a minute';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${nf.format(h)} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** Axis ticks: "2 h", "30 min". */
export function formatTick(seconds: number): string {
  if (seconds <= 0) return '0';
  if (seconds >= 3600) {
    const h = seconds / 3600;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
  }
  return `${Math.round(seconds / 60)} min`;
}
