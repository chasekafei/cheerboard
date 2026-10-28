export type ShareAssetKind = 'note' | 'comment' | 'memory';

const paths: Record<ShareAssetKind, string> = {
  note: './artwork/share-note-template.webp',
  comment: './artwork/share-comment-template.webp',
  memory: './artwork/share-memory-template.webp',
};

const assets = new Map<ShareAssetKind, HTMLImageElement>();

export function preloadShareAssets(): Promise<void> {
  return Promise.all((Object.keys(paths) as ShareAssetKind[]).map(kind => new Promise<void>(resolve => {
    const image = new Image();
    image.onload = () => { assets.set(kind, image); resolve(); };
    image.onerror = () => resolve();
    image.src = paths[kind];
  }))).then(() => undefined);
}

export function shareAsset(kind: ShareAssetKind): HTMLImageElement | null {
  return assets.get(kind) || null;
}
