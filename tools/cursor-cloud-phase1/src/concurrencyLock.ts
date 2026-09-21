/**
 * Application-level one-active-run lock (in-memory reference implementation).
 * Production uses the Postgres advisory / row lock in the migration + gateway.
 */

export type LockAcquireResult =
  | { ok: true; lockId: string }
  | { ok: false; reason: 'already_active'; activeRunId: string; activeIdempotencyKey?: string };

export class StorefrontRunLock {
  private active = new Map<
    string,
    { lockId: string; runId: string | null; idempotencyKey: string; acquiredAt: number }
  >();

  /**
   * Acquire lock for merchantKey. Same idempotencyKey returns the existing lock (safe retry).
   */
  acquire(
    merchantKey: string,
    idempotencyKey: string,
  ): LockAcquireResult & { reused?: boolean } {
    const existing = this.active.get(merchantKey);
    if (existing) {
      if (existing.idempotencyKey === idempotencyKey) {
        return { ok: true, lockId: existing.lockId, reused: true };
      }
      return {
        ok: false,
        reason: 'already_active',
        activeRunId: existing.runId || existing.lockId,
        activeIdempotencyKey: existing.idempotencyKey,
      };
    }
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.active.set(merchantKey, {
      lockId,
      runId: null,
      idempotencyKey,
      acquiredAt: Date.now(),
    });
    return { ok: true, lockId };
  }

  bindRun(merchantKey: string, runId: string): void {
    const e = this.active.get(merchantKey);
    if (e) e.runId = runId;
  }

  release(merchantKey: string, lockId?: string): boolean {
    const e = this.active.get(merchantKey);
    if (!e) return false;
    if (lockId && e.lockId !== lockId) return false;
    this.active.delete(merchantKey);
    return true;
  }

  getActive(merchantKey: string) {
    return this.active.get(merchantKey) ?? null;
  }
}
