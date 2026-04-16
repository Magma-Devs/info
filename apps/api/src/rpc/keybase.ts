import { config } from "../config.js";
import { fetchRest } from "./rest.js";
import { fetchAllSpecs } from "./specs.js";

async function fetchProviderMetadata(provider: string): Promise<{
  description?: { identity?: string; moniker?: string };
} | null> {
  try {
    const specs = await fetchAllSpecs();
    for (const spec of specs) {
      try {
        const data = await fetchRest<{
          stakeEntry: Array<{
            address: string;
            description?: { identity?: string; moniker?: string };
          }>;
        }>(`/lavanet/lava/pairing/providers/${spec.index}`);
        const match = data.stakeEntry?.find((p) => p.address === provider);
        if (match?.description?.identity) return match;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchProviderAvatar(provider: string, identityHint?: string): Promise<string | null> {
  try {
    let identity = identityHint;
    if (!identity) {
      const meta = await fetchProviderMetadata(provider);
      identity = meta?.description?.identity ?? undefined;
    }
    if (!identity) return null;

    const res = await fetch(
      `${config.external.keybaseApiUrl}/user/lookup.json?key_suffix=${encodeURIComponent(identity)}&fields=pictures`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      them?: Array<{ pictures?: { primary?: { url?: string } } }>;
    };
    return data.them?.[0]?.pictures?.primary?.url ?? null;
  } catch {
    return null;
  }
}
