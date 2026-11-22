import { CUSTOM_DATE, FEATURES, summaries, type FilterState } from '../filters/filterState';
import type { FilterOptions } from '../filters/options';
import { FilterGroup } from './FilterGroup';
import { ChipGroup, RangeField, SelectField, SelectRangeField, TextField, TriField } from './fields';

interface Props {
  filters: FilterState;
  options: FilterOptions;
  metaStatus: 'loading' | 'ready' | 'error';
  busy: boolean;
  onChange: (next: FilterState) => void;
  onShowResults: () => void;
}

export function FilterSidebar({ filters, options, metaStatus, busy, onChange, onShowResults }: Props) {
  /** Returns a setter for one field, keeping the rest of the state. */
  const set =
    <K extends keyof FilterState>(key: K) =>
    (value: FilterState[K]) =>
      onChange({ ...filters, [key]: value });

  const yearValue = filters.dealYear || (filters.dealDateFrom || filters.dealDateTo ? CUSTOM_DATE : '');

  const setYear = (value: string) => {
    if (value === CUSTOM_DATE) return;
    onChange({
      ...filters,
      dealYear: value,
      dealDateFrom: value ? `${value}-01-01` : '',
      dealDateTo: value ? `${value}-12-31` : '',
    });
  };

  return (
    <aside className="sidebar" aria-label="מסננים">
      {metaStatus === 'loading' && <p className="sidebar__status">טוען מסננים…</p>}
      {metaStatus === 'error' && (
        <p className="sidebar__error" role="alert">
          לא הצלחנו לטעון את אפשרויות הסינון.
        </p>
      )}

      <FilterGroup title="מסננים נפוצים" summary={summaries.common(filters)} defaultOpen>
        <SelectField label="עיר" value={filters.city} onChange={set('city')} options={options.cities} anyLabel="כל הערים" />
        <SelectRangeField
          label="חדרים"
          min={filters.roomsMin}
          max={filters.roomsMax}
          onMinChange={set('roomsMin')}
          onMaxChange={set('roomsMax')}
          // each side only offers values that keep "from" <= "to"
          minOptions={options.rooms.filter((o) => !filters.roomsMax || Number(o.value) <= Number(filters.roomsMax))}
          maxOptions={options.rooms.filter((o) => !filters.roomsMin || Number(o.value) >= Number(filters.roomsMin))}
        />
        <SelectField label="מחיר מרבי" value={filters.priceMax} onChange={set('priceMax')} options={options.prices} anyLabel="ללא הגבלה" />
      </FilterGroup>

      <FilterGroup title="מיקום" summary={summaries.location(filters)}>
        <TextField label="שכונה" value={filters.neighborhood} onChange={set('neighborhood')} placeholder="לדוגמה: אם המושבות" />
        <TextField label="רחוב" value={filters.street} onChange={set('street')} placeholder="לדוגמה: הרצל" />
      </FilterGroup>

      <FilterGroup title="פרטי הנכס" summary={summaries.property(filters)}>
        <ChipGroup legend="סוג נכס" options={options.propertyTypes} selected={filters.propertyTypes} onChange={set('propertyTypes')} />
        <ChipGroup legend="מצב הנכס" options={options.conditions} selected={filters.conditions} onChange={set('conditions')} />
        <RangeField label="שטח (מ״ר)" min={filters.sizeMin} max={filters.sizeMax} onMinChange={set('sizeMin')} onMaxChange={set('sizeMax')} />
        <RangeField label="קומה" min={filters.floorMin} max={filters.floorMax} onMinChange={set('floorMin')} onMaxChange={set('floorMax')} />
        <RangeField label="שנת בנייה" min={filters.yearBuiltMin} max={filters.yearBuiltMax} onMinChange={set('yearBuiltMin')} onMaxChange={set('yearBuiltMax')} />
      </FilterGroup>

      <FilterGroup title="מאפייני הבניין" summary={summaries.building(filters)}>
        {FEATURES.map(({ key, label }) => (
          <TriField key={key} label={label} value={filters[key]} onChange={set(key)} />
        ))}
      </FilterGroup>

      <FilterGroup title="פרטי העסקה" summary={summaries.deal(filters)}>
        <SelectField label="שנת עסקה" value={yearValue} onChange={setYear} options={options.years} anyLabel="כל השנים" />
        <TextField label="מחיר מינימלי" value={filters.priceMin} onChange={set('priceMin')} placeholder="₪" />
        <TextField label={'מחיר למ״ר עד'} value={filters.pricePerSqmMax} onChange={set('pricePerSqmMax')} placeholder="₪" />
      </FilterGroup>

      <button type="button" className="button button--block" onClick={onShowResults} disabled={busy}>
        {busy ? 'מחפש…' : 'הצגת תוצאות'}
      </button>
    </aside>
  );
}
