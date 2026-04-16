export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}

/** Row shape returned by GET /providers (paginated provider list). */
export interface ProviderListItem {
  provider: string;
  moniker: string;
  identity: string;
  activeServices: number;
  totalStake: string;
  totalDelegation: string;
  commission: string;
  cuSum30d: string | null;
  relaySum30d: string | null;
}
