export const PROVIDER_STATUS = {
  Active: "Active",
  Frozen: "Frozen",
  Unstaking: "Unstaking",
  Inactive: "Inactive",
  Jailed: "Jailed",
} as const;

export type ProviderStatus =
  (typeof PROVIDER_STATUS)[keyof typeof PROVIDER_STATUS];

export const HEALTH_STATUS = {
  Healthy: "healthy",
  Unhealthy: "unhealthy",
  Frozen: "frozen",
  Jailed: "jailed",
} as const;

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

export interface ProviderStake {
  provider: string;
  specId: string;
  status: ProviderStatus;
  stake: bigint;
  delegateLimit: bigint;
  delegateTotal: bigint;
  delegateCommission: number;
  geolocation: number;
  moniker: string;
  addons: string;
  extensions: string;
}

export interface ProviderInfo {
  address: string;
  moniker: string;
  specs: ProviderSpecInfo[];
}

export interface ProviderSpecInfo {
  specId: string;
  interfaces: string[];
  status: ProviderStatus;
}

export interface HealthCheckResult {
  provider: string;
  spec: string;
  apiInterface: string;
  status: HealthStatus;
  block?: number;
  latency?: number;
  message?: string;
  geolocation?: string;
  timestamp?: string;
}
