// Simple fetch with timeout & retry to make external calls robust.
export async function fetchWithTimeout(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {},
  retries = 0,
  retryDelayMs = 0
) {
  const { timeoutMs = 8000, ...init } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, retryDelayMs));
      return fetchWithTimeout(url, opts, retries - 1, retryDelayMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}