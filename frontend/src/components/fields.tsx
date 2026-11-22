import { useId, type ReactNode } from 'react';
import type { Tri } from '../filters/filterState';

export interface Option {
  value: string;
  label: string;
}

/** Label on the right, control on the left (RTL). */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="field__control">{children}</div>
    </div>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** Text of the "no filter" choice, e.g. "ללא הגבלה". */
  anyLabel: string;
}) {
  const id = useId();
  return (
    <Field label={props.label} htmlFor={id}>
      <select id={id} className="input input--select" value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">{props.anyLabel}</option>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextField(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={props.label} htmlFor={id}>
      <input id={id} className="input" type="text" value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
    </Field>
  );
}

/** "from – to" pair of numeric inputs. */
export function RangeField(props: {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <Field label={props.label} htmlFor={`${id}-min`}>
      <div className="range">
        <input id={`${id}-min`} className="input" inputMode="numeric" placeholder="מ-" aria-label={`${props.label} מ-`} value={props.min} onChange={(e) => props.onMinChange(e.target.value)} />
        <input id={`${id}-max`} className="input" inputMode="numeric" placeholder="עד" aria-label={`${props.label} עד`} value={props.max} onChange={(e) => props.onMaxChange(e.target.value)} />
      </div>
    </Field>
  );
}

/** "from – to" pair of dropdowns (same look as RangeField, for values picked from a list). */
export function SelectRangeField(props: {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  minOptions: Option[];
  maxOptions: Option[];
}) {
  const id = useId();
  const select = (suffix: string, anyLabel: string, value: string, onChange: (v: string) => void, options: Option[]) => (
    <select id={`${id}-${suffix}`} className="input input--select" aria-label={`${props.label} ${anyLabel}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{anyLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  return (
    <Field label={props.label} htmlFor={`${id}-min`}>
      <div className="range">
        {select('min', 'מ-', props.min, props.onMinChange, props.minOptions)}
        {select('max', 'עד', props.max, props.onMaxChange, props.maxOptions)}
      </div>
    </Field>
  );
}

/** Multi-select as toggle chips. */
export function ChipGroup<T extends string>(props: {
  legend: string;
  options: Array<[T, string]>;
  selected: T[];
  onChange: (selected: T[]) => void;
}) {
  const toggle = (value: T) =>
    props.onChange(props.selected.includes(value) ? props.selected.filter((v) => v !== value) : [...props.selected, value]);
  return (
    <fieldset className="chips">
      <legend className="chips__legend">{props.legend}</legend>
      <div className="chips__list">
        {props.options.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={props.selected.includes(value)} onClick={() => toggle(value)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const TRI_OPTIONS: Array<[Tri, string]> = [
  ['any', 'לא משנה'],
  ['yes', 'עם'],
  ['no', 'בלי'],
];

/** "Doesn't matter / with / without" segmented control. */
export function TriField(props: { label: string; value: Tri; onChange: (value: Tri) => void }) {
  const name = useId();
  return (
    <div className="field">
      <span className="field__label" id={`${name}-label`}>
        {props.label}
      </span>
      <div className="field__control">
        <div className="segmented" role="radiogroup" aria-labelledby={`${name}-label`}>
          {TRI_OPTIONS.map(([value, text]) => (
            <label key={value} className="segmented__option">
              <input type="radio" name={name} value={value} checked={props.value === value} onChange={() => props.onChange(value)} />
              <span>{text}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
