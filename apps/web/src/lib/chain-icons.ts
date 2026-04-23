/**
 * Web-side chain-icon resolver. The mapping + logic now live in
 * @info/shared (so apps/api can embed the same URLs in JSON responses);
 * this file is the thin web-local entry point.
 *
 * Icons are served out of apps/web/public/chains/, so a root-relative
 * path is what the browser needs — no baseUrl argument.
 */
import { getChainIconUrl } from "@info/shared";

export function getChainIcon(specId: string): string {
  return getChainIconUrl(specId);
}
