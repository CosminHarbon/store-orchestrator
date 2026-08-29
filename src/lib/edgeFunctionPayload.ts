/**
 * supabase.functions.invoke sets `data` to null on non-2xx and puts the
 * function JSON body on FunctionsHttpError.context. Billing endpoints return
 * structured `{ error: '…' }` on 4xx/5xx — read that body so the UI can
 * show the real reason instead of a generic failure.
 */
export async function payloadFromFunctionsInvoke(
  data: unknown,
  error: unknown,
): Promise<Record<string, unknown>> {
  if (data && typeof data === 'object') return data as Record<string, unknown>;

  const ctx =
    error && typeof error === 'object' && error !== null && 'context' in error
      ? (error as { context?: unknown }).context
      : undefined;

  if (ctx && typeof ctx === 'object' && ctx !== null && 'json' in ctx) {
    const json = (ctx as { json?: unknown }).json;
    if (typeof json === 'function') {
      try {
        const parsed = await json.call(ctx);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      } catch {
        /* body already consumed or not JSON */
      }
    }
  }

  return {};
}
