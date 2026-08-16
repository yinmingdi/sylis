export interface AgentReconciliationLoopOptions {
  reconcile: () => Promise<unknown>;
  signal: AbortSignal;
  intervalMs: number;
  onError?: (error: unknown) => void;
}

export async function runAgentReconciliationLoop(
  options: AgentReconciliationLoopOptions,
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await options.reconcile();
    } catch (error) {
      options.onError?.(error);
    }
    await abortableDelay(options.intervalMs, options.signal);
  }
}

async function abortableDelay(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}
