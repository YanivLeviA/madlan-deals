import { useId, type FormEvent } from 'react';

interface Props {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSearch: () => void;
}

/** Free-text search: type a sentence in Hebrew, the backend turns it into filters. */
export function SearchBar({ value, busy, onChange, onSearch }: Props) {
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <form className="searchbar" role="search" onSubmit={submit}>
      <label htmlFor={id} className="visually-hidden">
        חיפוש חופשי
      </label>
      <input
        id={id}
        className="searchbar__input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="לדוגמה: דירות עם חניה שנמכרו בפתח תקווה בשנת 2023"
        autoComplete="off"
      />
      <button type="submit" className="button" disabled={busy || value.trim() === ''}>
        {busy ? 'מחפש…' : 'חיפוש'}
      </button>
    </form>
  );
}
