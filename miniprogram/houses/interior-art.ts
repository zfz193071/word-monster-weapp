type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type Image = WechatMiniprogram.Image;

type LayerAsset = { path: string; source: string; rights: string; approved: boolean };
interface InteriorLayers { interior: LayerAsset; front: LayerAsset; ruin?: LayerAsset }
function layers(material: string, packageName: string, manifest: string, withRuin = true): InteriorLayers {
  const asset = (part: string): LayerAsset => Object.freeze({
    path: `/${packageName}/${material}-${part}-v2.png`,
    source: `docs/visual-audit/battlefield-overhaul/interior-layers/${manifest}.json`,
    rights: 'Project-generated artwork; built-in image_gen, 2026-11-10', approved: true,
  });
  return Object.freeze({ interior: asset('interior'), front: asset('front'),
    ...(withRuin ? { ruin: asset('ruin') } : {}) });
}
export const WOOD_INTERIOR = layers('wood', 'fortress-assets', 'manifest');
export const REINFORCED_INTERIOR = layers('reinforced', 'reinforced-fortress-assets', 'reinforced-manifest');
export const STONE_INTERIOR = layers('stone', 'stone-fortress-assets', 'stone-manifest', false);
export const CASTLE_INTERIOR = layers('castle', 'castle-fortress-assets', 'castle-manifest', false);
export const ARMORED_INTERIOR = layers('armored', 'armored-fortress-assets', 'armored-manifest', false);
export const INTERIOR_ASSETS = [...Object.values(WOOD_INTERIOR), ...Object.values(REINFORCED_INTERIOR), ...Object.values(STONE_INTERIOR), ...Object.values(CASTLE_INTERIOR), ...Object.values(ARMORED_INTERIOR)];
export function fortressInterior(level = 1) {
  return level === 1 ? WOOD_INTERIOR : level === 2 ? REINFORCED_INTERIOR : level === 3 ? STONE_INTERIOR : level === 4 ? CASTLE_INTERIOR : level === 5 ? ARMORED_INTERIOR : undefined;
}

/** Extend only the middle bays; preserve side walls, perspective and pixel aspect. */
export function drawFortressInterior(c: Context, image: Image, width: number, foreground = false, houseLevel = 1): void {
  // The foreground's transparent padding is retained in the PNG and sampled out here.
  const sy = foreground ? image.height * ((houseLevel >= 4 ? 200 : 220) / 724) : 0;
  const sh = foreground ? image.height * ((houseLevel >= 4 ? 440 : houseLevel === 2 ? 360 : 304) / 724) : image.height;
  const height = foreground ? 20 : 100;
  const top = foreground ? 540 : 460;
  const scale = height / sh;
  const cap = image.width * (!foreground && houseLevel >= 4 ? .25 : .16), middle = image.width - cap * 2;
  const capWidth = cap * scale, step = middle * scale;
  c.save(); c.beginPath(); c.rect(0, top, width, height); c.clip();
  c.drawImage(image, 0, sy, cap, sh, 0, top, capWidth, height);
  c.save(); c.beginPath(); c.rect(capWidth, top, width - 2 * capWidth, height); c.clip();
  for (let x = capWidth; x < width - capWidth; x += step) {
    c.drawImage(image, cap, sy, middle, sh, x, top, step + .5, height);
  }
  c.restore();
  c.drawImage(image, image.width - cap, sy, cap, sh, width - capWidth, top, capWidth, height);
  c.restore();
}

// Cosmetic placement only; the protected pet's targeting origin remains unchanged.
export const INTERIOR_PET_OFFSET_Y = 45;
