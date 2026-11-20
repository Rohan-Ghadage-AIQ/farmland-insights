import type { ComboboxOption } from '@/components/ui';
import { cropCategoryLabel, SUPPORTED_CROPS, type Crop } from '@/domain';

/**
 * The combobox's option identity for a crop. The English name is unique across
 * `SUPPORTED_CROPS`, so it can stand in for the crop itself; the category key (sent to the
 * API) is resolved from it later with `findCrop`.
 */
export function cropOptionValue(crop: Crop): string {
  return crop.english;
}

function toOption(crop: Crop): ComboboxOption {
  return {
    value: cropOptionValue(crop),
    label: `${crop.english} · ${crop.desi}`,
    secondary: cropCategoryLabel(crop.category),
    keywords: [crop.desi],
  };
}

/**
 * All supported crops as combobox options, with `recents` (most recent first, by English name)
 * moved to the front so they appear first until the user types a search.
 */
export function buildCropOptions(recents: readonly string[]): ComboboxOption[] {
  const recentCrops: Crop[] = [];
  for (const english of recents) {
    const found = SUPPORTED_CROPS.find((crop) => crop.english === english);
    if (found !== undefined) recentCrops.push(found);
  }
  const recentValues = new Set(recentCrops.map(cropOptionValue));
  const rest = SUPPORTED_CROPS.filter((crop) => !recentValues.has(crop.english));
  return [...recentCrops, ...rest].map(toOption);
}
