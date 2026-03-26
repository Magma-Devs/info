import type { HealthStatus } from "./provider.js";

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

export interface HealthProbeTask {
  type: "health" | "accountinfo" | "providerspecmoniker" | "markemptyaccountinforprovider";
  provider: string;
  spec?: string;
  apiinterface?: string;
  status?: string;
  data?: string;
  timestamp: string;
  secret: string;
  geolocation: string;
  execution_time?: string;
}

export interface AccountInfoResult {
  provider: ProviderAccountEntry[];
  frozen: ProviderAccountEntry[];
  unstaked: ProviderAccountEntry[];
}

export interface ProviderAccountEntry {
  address: string;
  chains: ChainEntry[];
}

export interface ChainEntry {
  chainID: string;
  endpoints: EndpointEntry[];
}

export interface EndpointEntry {
  iPPORT: string;
  geolocation: number;
  addons: string[];
  api_interfaces: string[];
  extensions: string[];
}
