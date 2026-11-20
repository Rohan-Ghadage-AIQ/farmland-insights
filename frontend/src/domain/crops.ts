import type { CropCategory, CropCategoryKey } from './types';

/** The 12 crop category keys, in the order the backend enum declares them. */
export const CROP_CATEGORY_KEYS = [
  'cereals_c3_temperate',
  'cereals_c4_tropical',
  'fruits_orchard',
  'fruits_tropical',
  'legumes_cool_season',
  'legumes_warm_season',
  'oilseeds_cool',
  'oilseeds_warm',
  'tubers_temperate',
  'tubers_tropical',
  'vegetables_cool',
  'vegetables_warm',
] as const satisfies readonly CropCategory[];

export const CROP_CATEGORY_LABELS: Readonly<Record<CropCategory, string>> = {
  cereals_c3_temperate: 'Cereals (C3, temperate)',
  cereals_c4_tropical: 'Cereals (C4, tropical)',
  fruits_orchard: 'Orchard fruits',
  fruits_tropical: 'Tropical fruits',
  legumes_cool_season: 'Legumes (cool season)',
  legumes_warm_season: 'Legumes (warm season)',
  oilseeds_cool: 'Oilseeds (cool season)',
  oilseeds_warm: 'Oilseeds (warm season)',
  tubers_temperate: 'Tubers (temperate)',
  tubers_tropical: 'Tubers (tropical)',
  vegetables_cool: 'Vegetables (cool season)',
  vegetables_warm: 'Vegetables (warm season)',
};

export interface Crop {
  readonly english: string;
  /** Desi (Hindi, transliterated) name as the backend lists it. */
  readonly desi: string;
  readonly category: CropCategory;
}

/**
 * Mirror of `SUPPORTED_CROPS` in `app/models/requests.py`. No endpoint returns it, so a drift test
 * (`crops.drift.test.ts`) parses the Python file and fails when the two lists differ.
 */
export const SUPPORTED_CROPS = [
  { english: 'Wheat', desi: 'Gehu', category: 'cereals_c3_temperate' },
  { english: 'Barley', desi: 'Jau', category: 'cereals_c3_temperate' },
  { english: 'Oats', desi: 'Jai', category: 'cereals_c3_temperate' },
  { english: 'Rye', desi: 'Rai', category: 'cereals_c3_temperate' },
  { english: 'Triticale', desi: 'Triticale', category: 'cereals_c3_temperate' },
  { english: 'Maize', desi: 'Makka', category: 'cereals_c4_tropical' },
  { english: 'Sorghum', desi: 'Jowar', category: 'cereals_c4_tropical' },
  { english: 'Pearl Millet', desi: 'Bajra', category: 'cereals_c4_tropical' },
  { english: 'Finger Millet', desi: 'Ragi', category: 'cereals_c4_tropical' },
  { english: 'Sugarcane', desi: 'Ganna', category: 'cereals_c4_tropical' },
  { english: 'Foxtail Millet', desi: 'Kangni', category: 'cereals_c4_tropical' },
  { english: 'Little Millet', desi: 'Kutki', category: 'cereals_c4_tropical' },
  { english: 'Barnyard Millet', desi: 'Sanwa', category: 'cereals_c4_tropical' },
  { english: 'Kodo Millet', desi: 'Kodo', category: 'cereals_c4_tropical' },
  { english: 'Green Peas', desi: 'Matar', category: 'legumes_cool_season' },
  { english: 'Lentils', desi: 'Masoor', category: 'legumes_cool_season' },
  { english: 'Chickpeas', desi: 'Chana', category: 'legumes_cool_season' },
  { english: 'Faba beans', desi: 'Bakla', category: 'legumes_cool_season' },
  { english: 'Grass pea', desi: 'Khesari', category: 'legumes_cool_season' },
  { english: 'Fenugreek (Seeds)', desi: 'Methi', category: 'legumes_cool_season' },
  { english: 'Soybeans', desi: 'Soyabean', category: 'legumes_warm_season' },
  { english: 'Peanuts', desi: 'Moongphali', category: 'legumes_warm_season' },
  { english: 'Cowpeas', desi: 'Lobia', category: 'legumes_warm_season' },
  { english: 'Mung beans', desi: 'Moong', category: 'legumes_warm_season' },
  { english: 'Kidney beans', desi: 'Rajma', category: 'legumes_warm_season' },
  { english: 'Pigeon pea', desi: 'Tur / Arhar', category: 'legumes_warm_season' },
  { english: 'Black gram', desi: 'Urad', category: 'legumes_warm_season' },
  { english: 'Moth bean', desi: 'Moth', category: 'legumes_warm_season' },
  { english: 'Horse gram', desi: 'Kulthi', category: 'legumes_warm_season' },
  { english: 'Potatoes', desi: 'Aloo', category: 'tubers_temperate' },
  { english: 'Beetroot', desi: 'Chukandar', category: 'tubers_temperate' },
  { english: 'Turnip', desi: 'Shalgam', category: 'tubers_temperate' },
  { english: 'Cassava', desi: 'Tapioca', category: 'tubers_tropical' },
  { english: 'Yams', desi: 'Suran', category: 'tubers_tropical' },
  { english: 'Sweet potatoes', desi: 'Shakarkand', category: 'tubers_tropical' },
  { english: 'Taro', desi: 'Arbi', category: 'tubers_tropical' },
  { english: 'Elephant Foot Yam', desi: 'Zamikand', category: 'tubers_tropical' },
  { english: 'Sunflowers', desi: 'Surajmukhi', category: 'oilseeds_warm' },
  { english: 'Sesame', desi: 'Til', category: 'oilseeds_warm' },
  { english: 'Castor beans', desi: 'Arandi', category: 'oilseeds_warm' },
  { english: 'Safflower', desi: 'Kusum', category: 'oilseeds_warm' },
  { english: 'Niger seed', desi: 'Ramtil', category: 'oilseeds_warm' },
  { english: 'Mustard', desi: 'Sarson', category: 'oilseeds_cool' },
  { english: 'Flaxseed', desi: 'Alsi', category: 'oilseeds_cool' },
  { english: 'Rapeseed', desi: 'Toria', category: 'oilseeds_cool' },
  { english: 'Apple', desi: 'Seb', category: 'fruits_orchard' },
  { english: 'Pear', desi: 'Nashpati', category: 'fruits_orchard' },
  { english: 'Peach', desi: 'Aadoo', category: 'fruits_orchard' },
  { english: 'Plum', desi: 'Aloo Bukhara', category: 'fruits_orchard' },
  { english: 'Apricot', desi: 'Khubani', category: 'fruits_orchard' },
  { english: 'Cherry', desi: 'Cherry', category: 'fruits_orchard' },
  { english: 'Walnut', desi: 'Akhrot', category: 'fruits_orchard' },
  { english: 'Banana', desi: 'Kela', category: 'fruits_tropical' },
  { english: 'Mango', desi: 'Aam', category: 'fruits_tropical' },
  { english: 'Pineapple', desi: 'Ananas', category: 'fruits_tropical' },
  { english: 'Papaya', desi: 'Papita', category: 'fruits_tropical' },
  { english: 'Guava', desi: 'Amrud', category: 'fruits_tropical' },
  { english: 'Pomegranate', desi: 'Anar', category: 'fruits_tropical' },
  { english: 'Jackfruit', desi: 'Kathal', category: 'fruits_tropical' },
  { english: 'Sapodilla', desi: 'Chikoo', category: 'fruits_tropical' },
  { english: 'Lychee', desi: 'Litchi', category: 'fruits_tropical' },
  { english: 'Coconut', desi: 'Nariyal', category: 'fruits_tropical' },
  { english: 'Tomato', desi: 'Tamatar', category: 'vegetables_warm' },
  { english: 'Bell Pepper', desi: 'Shimla Mirch', category: 'vegetables_warm' },
  { english: 'Eggplant (Brinjal)', desi: 'Baingan', category: 'vegetables_warm' },
  { english: 'Cucumber', desi: 'Kheera', category: 'vegetables_warm' },
  { english: 'Pumpkin', desi: 'Kaddu', category: 'vegetables_warm' },
  { english: 'Bitter Gourd', desi: 'Karela', category: 'vegetables_warm' },
  { english: 'Bottle Gourd', desi: 'Lauki', category: 'vegetables_warm' },
  { english: 'Ridge Gourd', desi: 'Torai', category: 'vegetables_warm' },
  { english: 'Okra / Ladyfinger', desi: 'Bhindi', category: 'vegetables_warm' },
  { english: 'Green Chilli', desi: 'Hari Mirch', category: 'vegetables_warm' },
  { english: 'Spinach', desi: 'Palak', category: 'vegetables_cool' },
  { english: 'Cabbage', desi: 'Patta Gobhi', category: 'vegetables_cool' },
  { english: 'Cauliflower', desi: 'Phool Gobhi', category: 'vegetables_cool' },
  { english: 'Carrot', desi: 'Gajar', category: 'vegetables_cool' },
  { english: 'Onion', desi: 'Pyaz', category: 'vegetables_cool' },
  { english: 'Radish', desi: 'Mooli', category: 'vegetables_cool' },
  { english: 'Broccoli', desi: 'Hari Gobhi', category: 'vegetables_cool' },
  { english: 'Garlic', desi: 'Lehsun', category: 'vegetables_cool' },
  { english: 'Fenugreek Leaves', desi: 'Methi Saag', category: 'vegetables_cool' },
  { english: 'Coriander Leaves', desi: 'Dhaniya', category: 'vegetables_cool' },
] as const satisfies readonly Crop[];

export function cropCategoryLabel(key: CropCategory): string {
  return CROP_CATEGORY_LABELS[key];
}

/** Returns the key if `value` is exactly one of the 12 category keys. */
export function parseCropCategoryKey(value: string): CropCategoryKey | null {
  const found = CROP_CATEGORY_KEYS.find((key) => key === value);
  return found === undefined ? null : (found as CropCategoryKey);
}

/** Lowercase, accent-stripped, whitespace-collapsed; `_` counts as a space (as on the backend). */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ');
}

/** Lower is better. */
function matchRank(haystack: string, needle: string): number {
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (haystack.split(' ').some((word) => word.startsWith(needle))) return 2;
  if (haystack.includes(needle)) return 3;
  return Number.POSITIVE_INFINITY;
}

/**
 * Finds crops whose English or desi name matches `query` (case- and accent-insensitive).
 * Results are ordered by match quality, then by catalogue order. A blank query returns everything.
 */
export function searchCrops(query: string): Crop[] {
  const needle = normalizeForSearch(query);
  if (needle === '') return [...SUPPORTED_CROPS];
  return SUPPORTED_CROPS.map((crop, index) => ({
    crop,
    index,
    rank: Math.min(
      matchRank(normalizeForSearch(crop.english), needle),
      matchRank(normalizeForSearch(crop.desi), needle),
    ),
  }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.crop);
}

/** Resolves an exact crop name the way the backend does (normalised English or desi name). */
export function findCrop(name: string): Crop | null {
  const needle = normalizeForSearch(name);
  if (needle === '') return null;
  return (
    SUPPORTED_CROPS.find(
      (crop) =>
        normalizeForSearch(crop.english) === needle || normalizeForSearch(crop.desi) === needle,
    ) ?? null
  );
}

export function groupCropsByCategory(): Record<CropCategory, Crop[]> {
  const grouped = Object.fromEntries(
    CROP_CATEGORY_KEYS.map((key) => [key, [] as Crop[]]),
  ) as Record<CropCategory, Crop[]>;
  for (const crop of SUPPORTED_CROPS) grouped[crop.category].push(crop);
  return grouped;
}
