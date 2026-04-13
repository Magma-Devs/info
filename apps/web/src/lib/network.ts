export function isTestnet(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.startsWith("testnet-");
}

export function getToggleUrl(): string {
  if (typeof window === "undefined") return "#";
  const { protocol, hostname } = window.location;
  const targetHost = isTestnet()
    ? hostname.replace("testnet-", "")
    : `testnet-${hostname}`;
  return `${protocol}//${targetHost}`;
}
