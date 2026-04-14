export const IS_TESTNET = process.env.NEXT_PUBLIC_NETWORK === "testnet";

export function isTestnet(): boolean {
  return IS_TESTNET;
}

export function getToggleUrl(): string {
  if (typeof window === "undefined") return "#";
  const { protocol, hostname } = window.location;
  const targetHost = IS_TESTNET
    ? hostname.replace("testnet-", "")
    : `testnet-${hostname}`;
  return `${protocol}//${targetHost}`;
}
