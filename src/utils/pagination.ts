/** Convert string query params to numbers with default & bounds. */
export function parsePagination(limitStr?: string, offsetStr?: string, maxLimit = 200) {
  let limit = Number(limitStr || 50);
  let offset = Number(offsetStr || 0);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  if (limit > maxLimit) limit = maxLimit;
  return { limit, offset };
}