export interface PageInfo {
  current_page: number;
  per_page: number;
  total_pages: number;
  total_count: number;
  has_previous: boolean;
  has_next: boolean;
}

export function buildPageInfo(
  limit: number,
  offset: number,
  totalCount: number,
): PageInfo {
  const perPage = Math.max(1, limit);
  const currentPage = Math.floor(offset / perPage) + 1;
  const totalPages = Math.ceil(totalCount / perPage) || 1;
  return {
    current_page: currentPage,
    per_page: perPage,
    total_pages: totalPages,
    total_count: totalCount,
    has_previous: currentPage > 1,
    has_next: currentPage < totalPages,
  };
}
