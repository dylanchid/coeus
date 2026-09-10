/** PostgREST caps each response at 1,000 rows by default, including service-role requests. */
export const POSTGREST_PAGE_SIZE = 1_000;

export interface PageResult<Row, ErrorType = unknown> {
  data: readonly Row[] | null;
  error: ErrorType | null;
}

/**
 * Read every row from a PostgREST query in bounded ranges. Callers rebuild the
 * query in `fetchPage` so filters and ordering stay identical on every page.
 */
export async function readAllPages<Row, ErrorType = unknown>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<Row, ErrorType>>,
  pageSize = POSTGREST_PAGE_SIZE
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
