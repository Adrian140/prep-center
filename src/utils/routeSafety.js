export const sanitizeInternalPath = (value, fallback = '/dashboard') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return fallback;
  return raw;
};
