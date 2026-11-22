import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Search,
  X,
} from 'lucide-react';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  headerClassName?: string;
  cellClassName?: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  csvHeader?: string;
  csvValue?: (row: T) => string | number;
  render: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  emptyState?: React.ReactNode;
  testId?: string;
  rowClassName?: (row: T) => string;
  // Enterprise DataTable Enhancements (all optional for full backward-compatibility)
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFn?: (row: T, query: string) => boolean;
  filterControls?: React.ReactNode;
  exportFilename?: string;
  loading?: boolean;
  error?: string | null;
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Reusable Enterprise DataTable for scaling to large datasets (hundreds/thousands of rows).
 * Features: instant search, multi-column sorting, filter slot, CSV export, configurable page sizes,
 * First/Prev/Page/Next/Last navigation, tabular numerals, and Loading/Error/Empty states.
 */
export function DataTable<T>({
  data,
  columns,
  getRowKey,
  defaultPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyState,
  testId,
  rowClassName,
  searchable = false,
  searchPlaceholder = 'Cari data...',
  searchFn,
  filterControls,
  exportFilename,
  loading = false,
  error = null,
}: DataTableProps<T>) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return data;
    if (searchFn) {
      return data.filter((row) => searchFn(row, q));
    }
    return data.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [data, query, searchable, searchFn]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return filteredData;
    const getter = col.sortValue;
    return [...filteredData].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      const cmp = sa.localeCompare(sb, 'id-ID', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir, columns]);

  const totalItems = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const pageRows = useMemo(
    () => sortedData.slice(startIndex, endIndex),
    [sortedData, startIndex, endIndex]
  );

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }
    return pages;
  }, [safePage, totalPages]);

  const handleToggleSort = (col: DataTableColumn<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    if (!exportFilename || sortedData.length === 0) return;
    const exportCols = columns.filter((c) => c.csvValue || c.sortValue);
    if (exportCols.length === 0) return;
    const headerRow = exportCols
      .map((c) => escapeCsvCell(c.csvHeader ?? (typeof c.header === 'string' ? c.header : c.key)))
      .join(',');
    const bodyRows = sortedData.map((row) =>
      exportCols
        .map((c) => escapeCsvCell(c.csvValue ? c.csvValue(row) : c.sortValue?.(row) ?? ''))
        .join(',')
    );
    const csvContent = `\uFEFF${[headerRow, ...bodyRows].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename.endsWith('.csv') ? exportFilename : `${exportFilename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasToolbar = searchable || Boolean(filterControls) || Boolean(exportFilename);

  return (
    <div data-testid={testId} className="w-full">
      {hasToolbar && (
        <div className="px-4 py-3 border-b border-stone-200 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[220px]">
            {searchable && (
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setCurrentPage(1);
                    }}
                    aria-label="Hapus pencarian"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            {filterControls}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {totalItems} baris
            </span>
            {exportFilename && (
              <button
                type="button"
                disabled={sortedData.length === 0}
                onClick={handleExportCsv}
                data-testid={testId ? `${testId}-export-csv` : 'datatable-export-csv'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor CSV</span>
              </button>
            )}
          </div>
        </div>
      )}

      {error ? (
        <div role="alert" className="p-8 text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="text-sm font-medium text-rose-800">{error}</p>
        </div>
      ) : loading ? (
        <div className="p-4 space-y-2.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-9 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : totalItems === 0 ? (
        <div className="p-10 text-center">
          {query.trim() ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Tidak ada hasil untuk &ldquo;{query.trim()}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Reset Pencarian
              </button>
            </div>
          ) : (
            emptyState ?? <p className="text-sm text-slate-500">Belum ada data tercatat.</p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-xs uppercase tracking-wider font-semibold text-stone-500">
                  {columns.map((col) => {
                    const canSort = Boolean(col.sortValue && col.sortable !== false);
                    const isSorted = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        className={`px-4 py-3 whitespace-nowrap ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        } ${col.headerClassName ?? ''}`}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={() => handleToggleSort(col)}
                            className={`inline-flex items-center gap-1 font-semibold hover:text-stone-900 transition-colors ${
                              col.align === 'right' ? 'flex-row-reverse' : ''
                            }`}
                          >
                            <span>{col.header}</span>
                            {isSorted ? (
                              sortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-emerald-700" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-emerald-700" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-stone-300" />
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {pageRows.map((row, idx) => (
                  <tr
                    key={getRowKey(row, startIndex + idx)}
                    className={
                      rowClassName ? rowClassName(row) : 'hover:bg-stone-50/80 transition-colors'
                    }
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-2.5 align-middle ${
                          col.align === 'right'
                            ? 'text-right font-mono tabular-nums'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        } ${col.cellClassName ?? ''}`}
                      >
                        {col.render(row, startIndex + idx)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div
            data-testid={testId ? `${testId}-pagination` : 'datatable-pagination'}
            className="px-4 py-3 border-t border-stone-200 bg-stone-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-600"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono tabular-nums">
                Menampilkan <strong className="text-stone-900">{startIndex + 1}-{endIndex}</strong> dari{' '}
                <strong className="text-stone-900">{totalItems}</strong> data
              </span>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span>Baris:</span>
                <select
                  aria-label="Jumlah baris per halaman"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-600"
                >
                  {pageSizeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1 self-end sm:self-auto">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(1)}
                aria-label="Halaman pertama"
                className="p-1.5 text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </button>

              {pageNumbers.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCurrentPage(num)}
                  aria-current={num === safePage ? 'page' : undefined}
                  className={`min-w-[28px] h-7 px-2 text-xs font-mono font-semibold rounded-md transition-colors ${
                    num === safePage
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Halaman berikutnya"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="hidden sm:inline">Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                aria-label="Halaman terakhir"
                className="p-1.5 text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
