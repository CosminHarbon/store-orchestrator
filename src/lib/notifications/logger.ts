const PREFIX = '[Push]';

function isDev() {
  try {
    return import.meta.env.DEV;
  } catch {
    return false;
  }
}

function redactToken(token: string | null | undefined) {
  if (!token) return '(none)';
  if (isDev()) return `${token.slice(0, 8)}…(${token.length})`;
  return `(len=${token.length})`;
}

export const pushLog = {
  info(message: string, extra?: Record<string, unknown>) {
    if (!isDev() && !extra) {
      console.info(`${PREFIX} ${message}`);
      return;
    }
    if (extra?.token && typeof extra.token === 'string') {
      console.info(`${PREFIX} ${message}`, { ...extra, token: redactToken(extra.token) });
      return;
    }
    console.info(`${PREFIX} ${message}`, extra ?? '');
  },
  warn(message: string, extra?: unknown) {
    console.warn(`${PREFIX} ${message}`, extra ?? '');
  },
  error(message: string, extra?: unknown) {
    console.error(`${PREFIX} ${message}`, extra ?? '');
  },
};
