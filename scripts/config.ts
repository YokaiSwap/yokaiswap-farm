import { networkSuffix } from "./common";

export const tokens = {
  USDT: "Nervos-Peg Tether USD",
  ethUSDT: "Nervos-Peg Ethereum Tether USD",
  solUSDT: "Nervos-Peg Solana Tether USD",
};

export const isTestOrDev = /testnet|devnet/.test(networkSuffix ?? "");
export const yokContractName = isTestOrDev
  ? "MintableYokaiToken"
  : "YokaiToken";
