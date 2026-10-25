export const c = {
  bg: '#0f1115',
  panel: '#181b22',
  line: '#2a2f3a',
  text: '#e7e9ee',
  muted: '#9aa3b2',
  accent: '#5b8cff',
  ok: '#3ecf8e',
  danger: '#ef5b5b',
};

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}
