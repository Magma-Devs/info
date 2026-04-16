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

/**
 * Keybase identity fingerprints are hex strings up to 32 chars. Anything
 * that doesn't match is either malformed chain data or an attempt to slip
 * other characters into the outbound URL. Reject early; encodeURIComponent
 * still runs below as defense-in-depth so any future loosening here
 * doesn't reopen an SSRF vector.
 */
const KEYBASE_IDENTITY_RE = /^[A-Fa-f0-9]{1,64}$/;

export async function fetchProviderAvatar(provider: string, identityHint?: string): Promise<string | null> {
  try {
    let identity = identityHint;
    if (!identity) {
      const meta = await fetchProviderMetadata(provider);
      identity = meta?.description?.identity ?? undefined;
    }
    if (!identity) return null;
    if (!KEYBASE_IDENTITY_RE.test(identity)) return null;

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
