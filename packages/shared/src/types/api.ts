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
