import axios from "axios";

const MAINNET_API_URL = process.env.NEXT_PUBLIC_API_URL_MAINNET ?? "http://localhost:8080";
const TESTNET_API_URL = process.env.NEXT_PUBLIC_API_URL_TESTNET ?? MAINNET_API_URL;

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const network = localStorage.getItem("lava-network");
    if (network === "testnet") {
      return TESTNET_API_URL;
    }
  }
  return MAINNET_API_URL;
}

export const api = axios.create({
  baseURL: getApiUrl(),
  timeout: 30_000,
});
