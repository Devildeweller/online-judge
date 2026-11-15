const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const number = new Intl.NumberFormat();

export const formatDateTime = (value: string | Date) => dateTime.format(new Date(value));
export const formatDate = (value: string | Date) => dateOnly.format(new Date(value));
export const formatNumber = (value: number) => number.format(value);

export function timeAgo(value: string | Date, now = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return Math.abs(seconds) < 10 ? 'just now' : relative.format(seconds, 'second');
}

export function formatTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
}

export function formatMemory(kb: number | null | undefined): string {
  if (kb === null || kb === undefined) return '–';
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** 93784000 -> "1d 02:03:04"; under a day -> "02:03:04". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

export function formatSpan(startIso: string, endIso: string): string {
  const minutes = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${+(minutes / 60).toFixed(1)} h`;
  return `${+(minutes / 1440).toFixed(1)} days`;
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? '–' : `${((part / whole) * 100).toFixed(1)}%`;
}

/** Value for <input type="datetime-local"> in the browser's own time zone. */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
