/** Health status for a single interface endpoint (from gRPC probe) */
export interface InterfaceHealth {
  name: string;
  geolocation: string;
  status: string;
  latencyMs: number | null;
  block: number | null;
  message: string | null;
  timestamp: string;
}

/** Aggregated health for a spec or provider-spec pair */
export interface SpecHealth {
  status: "healthy" | "unhealthy";
  total: number;
  unhealthy: number;
  oldestTimestamp: string;
  interfaces: InterfaceHealth[];
}
