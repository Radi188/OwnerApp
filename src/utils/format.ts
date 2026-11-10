const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export function money(v: unknown, opts: { decimals?: number } = {}): string {
  const n = toNum(v);
  const d = opts.decimals ?? (Math.abs(n) >= 1000 ? 0 : 2);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function riel(v: unknown): string {
  return '៛' + Math.round(toNum(v)).toLocaleString('en-US');
}

/** "2026-11-09" or ISO → "Nov 9, 2026" */
export function fmtDate(v?: string | null): string {
  if (!v || v === 'N/A') return '—';
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
  if (isNaN(d.getTime())) return v;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "2026-11" → "Nov 2026" */
export function fmtMonth(ym?: string | null): string {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  const i = parseInt(m, 10) - 1;
  return MONTHS[i] ? `${MONTHS[i]} ${y}` : ym;
}

export function timeAgo(v?: string | null): string {
  if (!v) return '';
  const diff = Date.now() - new Date(v).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(v);
}

export function daysUntil(v?: string | null): number {
  if (!v) return 0;
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
}

export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function thisMonthYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function capitalize(s?: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

/** Strip HTML tags from rich-text content (announcements are stored as HTML). */
export function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Wrap plain text back into simple paragraphs so the web editor renders it. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as any).message || fallback);
  return fallback;
}
