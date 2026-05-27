// One-off: derive the init1 address from the configured key and read its
// on-chain balance from Initia mainnet REST. Prints ONLY the address + balances
// (never the private key).
import "dotenv/config";
import { RawKey, MnemonicKey } from "@initia/initia.js";

const REST = process.env.INITIA_REST || "https://rest.initia.xyz";

function loadKey() {
  const pk = (process.env.RESOLVER_PRIVATE_KEY || "").trim();
  if (pk) return RawKey.fromHex(pk.startsWith("0x") ? pk : `0x${pk}`);
  const mn = (process.env.RESOLVER_MNEMONIC || "").trim();
  if (mn) return new MnemonicKey({ mnemonic: mn });
  throw new Error("Set RESOLVER_PRIVATE_KEY or RESOLVER_MNEMONIC in .env");
}

const key = loadKey();
const address = key.accAddress; // init1...
console.log("address:", address);

const res = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${address}`);
console.log("http:", res.status);
const json = await res.json();
const balances = json.balances || [];
if (balances.length === 0) {
  console.log("balances: (none — address is empty / unfunded)");
} else {
  for (const b of balances) {
    const human = b.denom === "uinit" ? ` (${Number(b.amount) / 1e6} INIT)` : "";
    console.log(`  ${b.amount} ${b.denom}${human}`);
  }
}
