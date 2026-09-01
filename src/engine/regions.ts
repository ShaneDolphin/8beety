import type { Region } from "./project";

// §6.2/§10.1: regions partition a track by bars; no regions = one whole-song
// region. Splitting at a bar divides the containing region; both halves
// inherit its overrides.
export function splitRegions(
  regions: Region[] | undefined,
  bar: number,
  totalBars: number,
): Region[] | undefined {
  const base: Region[] = regions?.length ? regions : [{ startBar: 0, endBar: totalBars }];
  const idx = base.findIndex((r) => bar > r.startBar && bar < r.endBar);
  if (idx < 0) return regions;
  const r = base[idx];
  const out = [...base];
  out.splice(idx, 1, { ...r, endBar: bar }, { ...r, startBar: bar });
  return out;
}

// Removing a region's leading boundary merges it into its predecessor (which
// keeps its own overrides). Down to one region = back to "no regions".
export function mergeRegions(regions: Region[], index: number): Region[] | undefined {
  if (index <= 0 || index >= regions.length) return regions;
  const out = [...regions];
  const merged = { ...out[index - 1], endBar: out[index].endBar };
  out.splice(index - 1, 2, merged);
  return out.length <= 1 ? undefined : out;
}

export function updateRegion(regions: Region[], index: number, patch: Partial<Region>): Region[] {
  return regions.map((r, i) => (i === index ? { ...r, ...patch } : r));
}
