import { CONDITION_HE, PROPERTY_TYPE_HE, SOURCE_HE } from '../../../shared/aliases';
import type { SlimDeal } from '../../../shared/types';
import { formatNumber, formatPrice } from '../filters/filterState';

function formatDeal(deal: SlimDeal): string {
  const [y, m, d] = deal.deal_date.split('-');
  return deal.deal_date_precision === 'month' ? `${m}/${y}` : `${d}/${m}/${y}`;
}

const FEATURE_TAGS: Array<[keyof Pick<SlimDeal, 'has_elevator' | 'has_parking' | 'has_balcony' | 'has_safe_room'>, string]> = [
  ['has_elevator', 'מעלית'],
  ['has_parking', 'חניה'],
  ['has_balcony', 'מרפסת'],
  ['has_safe_room', 'ממ״ד'],
];

function DealCard({ deal }: { deal: SlimDeal }) {
  const address = [deal.street, deal.neighborhood, deal.city].filter(Boolean).join(', ');
  const facts = [
    deal.rooms !== null && `${deal.rooms} חדרים`,
    deal.size_sqm !== null && `${formatNumber(deal.size_sqm)} מ״ר`,
    deal.floor !== null && `קומה ${deal.floor}${deal.total_floors ? ` מתוך ${deal.total_floors}` : ''}`,
    deal.year_built !== null && `נבנה ב-${deal.year_built}`,
  ].filter(Boolean);
  const meta = [
    deal.property_type !== 'other' && PROPERTY_TYPE_HE[deal.property_type],
    deal.condition && CONDITION_HE[deal.condition],
    deal.price_per_sqm !== null && `${formatPrice(deal.price_per_sqm)} למ״ר`,
    deal.source && `מקור: ${SOURCE_HE[deal.source]}`,
  ].filter(Boolean);

  return (
    <article className="deal">
      <header className="deal__header">
        <strong className="deal__price">{formatPrice(deal.price_nis)}</strong>
        <time className="deal__date" dateTime={deal.deal_date}>
          {formatDeal(deal)}
        </time>
      </header>
      <p className="deal__address">{address}</p>
      <ul className="deal__facts">
        {facts.map((f) => (
          <li key={String(f)}>{f}</li>
        ))}
      </ul>
      <p className="deal__meta">{meta.join(' · ')}</p>
      <ul className="deal__tags">
        {FEATURE_TAGS.filter(([key]) => deal[key] === true).map(([key, label]) => (
          <li key={key}>{label}</li>
        ))}
      </ul>
    </article>
  );
}

const countLabel = (total: number) => (total === 1 ? 'נמצאה עסקה אחת' : `נמצאו ${formatNumber(total)} עסקאות`);

export function ResultsPanel(props: {
  deals: SlimDeal[];
  total: number;
  page: number;
  totalPages: number;
  warnings: string[];
  interpreted: boolean;
  loading: boolean;
  error: string | null;
  searched: boolean;
  onPage: (page: number) => void;
}) {
  const showList = props.searched && props.total > 0;

  return (
    <main className="results" aria-live="polite" aria-busy={props.loading}>
      <h2 className="results__title">תוצאות החיפוש</h2>

      {props.error && (
        <p className="results__error" role="alert">
          {props.error}
        </p>
      )}
      {props.interpreted && props.searched && !props.error && <p className="results__note">המסננים עודכנו לפי החיפוש החופשי.</p>}
      {props.warnings.length > 0 && (
        <ul className="results__warnings">
          {props.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {props.loading && <p className="results__status">מחפש…</p>}

      {!props.loading && !props.error && !props.searched && (
        <p className="results__prompt">חפשו חופשי, או בחרו מסננים ולחצו על הצגת תוצאות</p>
      )}

      {showList ? (
        <>
          <p className="results__count">{countLabel(props.total)}</p>
          <div className="results__list">
            {props.deals.map((d) => (
              <DealCard key={d.deal_id} deal={d} />
            ))}
          </div>
          {props.totalPages > 1 && (
            <div className="pager">
              <button type="button" className="button pager__button" disabled={props.loading || props.page <= 1} onClick={() => props.onPage(props.page - 1)}>
                הקודם
              </button>
              <span>
                עמוד {props.page} מתוך {props.totalPages}
              </span>
              <button
                type="button"
                className="button pager__button"
                disabled={props.loading || props.page >= props.totalPages}
                onClick={() => props.onPage(props.page + 1)}
              >
                הבא
              </button>
            </div>
          )}
        </>
      ) : (
        props.searched && !props.loading && <p className="results__empty">לא נמצאו עסקאות</p>
      )}
    </main>
  );
}
