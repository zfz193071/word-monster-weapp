// The asynchronous module import downloads its ordinary miniprogram subpackage.
// Share successful loads, but never cache an unresolved import forever.
let pending: Promise<void> | undefined;
export function loadImageAssets(): Promise<void> {
  if (pending) return pending;
  const attempt = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('图片资源加载超时')), 15000);
    try {
      require.async('../assets/images/ready').then(() => {
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
