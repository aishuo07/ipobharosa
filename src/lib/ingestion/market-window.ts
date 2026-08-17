export const MARKET_FINALIZATION_WINDOW_MS = 2 * 24 * 60 * 60 * 1_000;

export function marketFinalizationCutoff(now = new Date()): Date {
  return new Date(now.getTime() - MARKET_FINALIZATION_WINDOW_MS);
}
