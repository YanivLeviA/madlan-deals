import { lookupKey } from './cleaners.js';
import type { Condition, DealSource, PropertyType } from './types.js';

function buildMapping<T>(entries: Array<[T, string[]]>): Map<string, T> {
  const index = new Map<string, T>();
  for (const [canonical, aliases] of entries) {
    for (const a of aliases) index.set(lookupKey(a), canonical);
  }
  return index;
}

// --------------------------------------------------------------------------
// Cities: canonical Hebrew name -> accepted spellings.
// lookupKey() already ignores spaces / hyphens / quotes, so "בית-שמש" == "בית שמש".
// --------------------------------------------------------------------------
const CITIES: Array<[string, string[]]> = [
  ['תל אביב-יפו', ['תל אביב-יפו', 'תל אביב', 'ת"א', 'Tel Aviv', 'Tel Aviv-Yafo', 'Tel-Aviv']],
  ['ירושלים', ['ירושלים', 'Jerusalem']],
  ['חיפה', ['חיפה', 'Haifa']],
  ['ראשון לציון', ['ראשון לציון', 'ראשל"צ', 'Rishon LeZion', 'Rishon Lezion']],
  ['פתח תקווה', ['פתח תקווה', 'פתח תקוה', 'פ"ת', 'Petah Tikva', 'Petach Tikva']],
  ['אשדוד', ['אשדוד', 'Ashdod']],
  ['נתניה', ['נתניה', 'Netanya']],
  ['באר שבע', ['באר שבע', 'ב"ש', 'Beer Sheva', "Be'er Sheva", 'Beersheba']],
  ['חולון', ['חולון', 'Holon']],
  ['בני ברק', ['בני ברק', 'Bnei Brak']],
  ['רמת גן', ['רמת גן', 'ר"ג', 'Ramat Gan']],
  ['רחובות', ['רחובות', 'Rehovot']],
  ['הרצליה', ['הרצליה', 'Herzliya']],
  ['כפר סבא', ['כפר סבא', 'Kfar Saba']],
  ['רעננה', ['רעננה', 'Raanana', "Ra'anana"]],
  ['גבעתיים', ['גבעתיים', 'Givatayim']],
  ['בת ים', ['בת ים', 'Bat Yam']],
  ['בית שמש', ['בית שמש', 'Beit Shemesh']],
  ['מודיעין-מכבים-רעות', ['מודיעין-מכבים-רעות', 'מודיעין מכבים רעות', 'מודיעין', 'Modiin', "Modi'in", 'Modiin-Maccabim-Reut']],
];

const cityMapping = buildMapping(CITIES);
export const canonicalCity = (raw: string): string | undefined => cityMapping.get(lookupKey(raw));

// --------------------------------------------------------------------------
// Neighborhood aliases (exact key match only; generic names such as "מרכז" stay as they are)
// --------------------------------------------------------------------------
const NEIGHBORHOODS: Array<[string, string[]]> = [
  ['פלורנטין', ['Florentin']],
  ['רמת בית שמש א\'', ['רמב"ש א\'']],
  ['רמת בית שמש ב\'', ['רמב"ש ב\'']],
  ['רמת בית שמש ג\'', ['רמב"ש ג\'']],
  ['רמת בית שמש ד\'', ['רמב"ש ד\'']],
];
const neighborhoodMapping = buildMapping(NEIGHBORHOODS);
export const canonicalNeighborhood = (raw: string): string | undefined => neighborhoodMapping.get(lookupKey(raw));

// --------------------------------------------------------------------------
// Enumerations: Hebrew label -> code
// --------------------------------------------------------------------------
const PROPERTY_TYPES: Array<[PropertyType, string[]]> = [
  ['apartment', ['דירה']],
  ['duplex', ['דופלקס']],
  ['penthouse', ['פנטהאוז']],
  ['garden_apartment', ['דירת גן']],
  ['roof_apartment', ['דירת גג']],
  ['private_house', ['בית פרטי']],
];
const propertyTypeMapping = buildMapping(PROPERTY_TYPES);
export const propertyTypeLookup = (raw: string): PropertyType | undefined => propertyTypeMapping.get(lookupKey(raw));
export const PROPERTY_TYPE_HE: Record<Exclude<PropertyType, 'other'>, string> = {
  apartment: 'דירה',
  duplex: 'דופלקס',
  penthouse: 'פנטהאוז',
  garden_apartment: 'דירת גן',
  roof_apartment: 'דירת גג',
  private_house: 'בית פרטי',
};

const CONDITIONS: Array<[Condition, string[]]> = [
  ['new_from_developer', ['חדש מקבלן']],
  ['renovated', ['משופץ']],
  ['good', ['במצב טוב']],
  ['well_kept', ['שמור']],
  ['needs_renovation', ['דורש שיפוץ']],
];
const conditionMapping = buildMapping(CONDITIONS);
export const conditionLookup = (raw: string): Condition | undefined => conditionMapping.get(lookupKey(raw));
export const CONDITION_HE: Record<Condition, string> = {
  new_from_developer: 'חדש מקבלן',
  renovated: 'משופץ',
  good: 'במצב טוב',
  well_kept: 'שמור',
  needs_renovation: 'דורש שיפוץ',
};

const SOURCES: Array<[DealSource, string[]]> = [
  ['tax_authority', ['רשות המסים', 'רשות מסים', 'רשות המיסים']],
  ['broker', ['מתווך']],
  ['owner', ['בעל נכס']],
];
const sourceMapping = buildMapping(SOURCES);
export const sourceLookup = (raw: string): DealSource | undefined => sourceMapping.get(lookupKey(raw));
export const SOURCE_HE: Record<DealSource, string> = {
  tax_authority: 'רשות המסים',
  broker: 'מתווך',
  owner: 'בעל נכס',
};

/** Used only to break ties between conflicting duplicate rows (higher = more trusted). */
export const SOURCE_PRIORITY: Record<DealSource, number> = { tax_authority: 3, owner: 2, broker: 1 };
