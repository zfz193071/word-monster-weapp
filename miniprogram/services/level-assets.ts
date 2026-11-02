// The asynchronous module import downloads its ordinary miniprogram subpackage.
// Keep failed loads retryable; a successful package is shared across all seven categories.
let pending: Promise<void> | undefined;
export function loadLevelAssets(): Promise<void> {
  if (!pending) pending = require.async('../learning-assets/ready').then(() => undefined)
    .catch((error: unknown) => { pending = undefined; throw error; });
  return pending!;
}
