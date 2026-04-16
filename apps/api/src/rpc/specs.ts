import { BASE_SPECS, chainDisplayName } from "@info/shared/constants";
import { fetchRest } from "./rest.js";

export async function fetchAllSpecs(): Promise<Array<{ index: string; name: string }>> {
  const data = await fetchRest<{
    chainInfoList: Array<{ chainName: string; chainID: string }>;
  }>("/lavanet/lava/spec/show_all_chains");
  return (data.chainInfoList ?? [])
    .filter((c) => !BASE_SPECS.has(c.chainID))
    .map((c) => ({ index: c.chainID, name: chainDisplayName(c.chainID, c.chainName) }));
}
