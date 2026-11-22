import { useEffect, useRef, useState } from 'react';
import { ApiError, getMeta, searchDeals, type DatasetMeta, type SearchBody, type SearchResponse } from './api';
import { FilterSidebar } from './components/FilterSidebar';
import { ResultsPanel } from './components/ResultsPanel';
import { SearchBar } from './components/SearchBar';
import { emptyFilters, fromFilters, toFilters, type FilterState } from './filters/filterState';
import { buildFilterOptions } from './filters/options';

const emptyResult = {
  deals: [] as SearchResponse['results'],
  total: 0,
  page: 1,
  totalPages: 0,
  warnings: [] as string[],
  interpreted: false,
};

export function App() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [metaStatus, setMetaStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState(emptyResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const lastRequest = useRef<SearchBody | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getMeta()
      .then((data) => {
        if (cancelled) return;
        setMeta(data);
        setMetaStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setMetaStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = (body: SearchBody, page = 1) => {
    const id = ++requestSeq.current;
    lastRequest.current = body;
    setLoading(true);
    setError(null);

    searchDeals({ ...body, page })
      .then((data) => {
        if (id !== requestSeq.current) return;
        setFilters(fromFilters(data.filters));
        setResult({
          deals: data.results,
          total: data.total,
          page: data.page,
          totalPages: data.total_pages,
          warnings: data.warnings,
          interpreted: data.interpreted,
        });
        setSearched(true);
      })
      .catch((err: unknown) => {
        if (id !== requestSeq.current) return;
        setError(err instanceof ApiError ? err.message : 'משהו השתבש. נסו שוב.');
      })
      .finally(() => {
        if (id === requestSeq.current) setLoading(false);
      });
  };

  const searchByText = () => {
    const text = query.trim();
    if (!text) return;
    runSearch({ query: text });
  };

  const searchByFilters = () => runSearch({ filters: toFilters(filters) });

  const goToPage = (page: number) => {
    if (lastRequest.current) runSearch(lastRequest.current, page);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="topbar__title">חיפוש עסקאות נדל״ן</h1>
        <SearchBar value={query} busy={loading} onChange={setQuery} onSearch={searchByText} />
      </header>

      <div className="layout">
        <FilterSidebar
          filters={filters}
          options={buildFilterOptions(meta, filters)}
          metaStatus={metaStatus}
          busy={loading}
          onChange={setFilters}
          onShowResults={searchByFilters}
        />
        <ResultsPanel
          deals={result.deals}
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          warnings={result.warnings}
          interpreted={result.interpreted}
          loading={loading}
          error={error}
          searched={searched}
          onPage={goToPage}
        />
      </div>
    </div>
  );
}
