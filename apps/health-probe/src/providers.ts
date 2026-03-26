import axios from "axios";
import { getConfig } from "./config.js";
import pino from "pino";

const logger = pino({ name: "providers" });

export interface ProviderEntry {
  address: string;
  moniker?: string;
}

/**
 * Fetch the list of all providers from the API.
 * Replaces the Python `requests.get(PROVIDERS_URL)` call.
 */
export async function fetchProviders(): Promise<ProviderEntry[]> {
  const config = getConfig();
  try {
    const { data } = await axios.get(config.PROVIDERS_URL, { timeout: 30_000 });
    // The providers endpoint returns either an array or { data: [...] }
    const providers = Array.isArray(data) ? data : data?.data ?? [];
    return providers.map((p: Record<string, unknown>) => ({
      address: String(p.address ?? p.provider ?? ""),
      moniker: p.moniker ? String(p.moniker) : undefined,
    })).filter((p: ProviderEntry) => p.address);
  } catch (err) {
    logger.error({ err }, "Failed to fetch providers");
    return [];
  }
}
