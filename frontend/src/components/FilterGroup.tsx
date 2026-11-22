import { useId, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Short teal text shown on the header while the group is collapsed (the current selection). */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Chevron() {
  return (
    <svg className="group__chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A collapsible section of the filter panel. */
export function FilterGroup({ title, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={`group${open ? ' group--open' : ''}`}>
      <h3 className="group__heading">
        <button type="button" className="group__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          <span className="group__title">{title}</span>
          {!open && summary && <span className="group__summary" title={summary}>{summary}</span>}
          <Chevron />
        </button>
      </h3>
      <div id={bodyId} className="group__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
