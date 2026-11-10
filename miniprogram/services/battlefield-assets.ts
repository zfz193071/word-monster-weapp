// The asynchronous module import downloads its ordinary miniprogram subpackage.
// Share successful loads, but never cache an unresolved import forever.
let pending: Promise<void> | undefined;
export function loadBattlefieldAssets(levelId: number): Promise<void> {
  if (levelId !== 1) return Promise.resolve();
  if (pending) return pending;
  const attempt = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('战场资源加载超时')), 15000);
    try {
      require.async('../battlefield-assets/ready').then(() => {
        clearTimeout(timeout); resolve();
      }, (error: unknown) => { clearTimeout(timeout); reject(error); });
    } catch (error) { clearTimeout(timeout); reject(error); }
  });
  const shared = attempt.catch((error: unknown) => {
    if (pending === shared) pending = undefined;
    throw error;
  });
  pending = shared;
  return shared;
}
