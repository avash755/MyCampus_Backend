const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Use a password with at least 8 characters.';
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Use a password no longer than 72 UTF-8 bytes.';
  }
  return null;
}

function isEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pagination(query = {}, defaultLimit = DEFAULT_PAGE_SIZE) {
  const rawPage = query.page === undefined ? '1' : String(query.page);
  const rawLimit = query.limit === undefined ? String(defaultLimit) : String(query.limit);
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit)) {
    const error = new Error('Page and limit must be positive whole numbers.');
    error.status = 400;
    throw error;
  }
  const page = Math.max(1, Math.min(Number(rawPage), 10000));
  const limit = Math.max(1, Math.min(Number(rawLimit), MAX_PAGE_SIZE));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { passwordError, isEmail, safeHttpUrl, escapeRegex, pagination, MAX_PAGE_SIZE };
