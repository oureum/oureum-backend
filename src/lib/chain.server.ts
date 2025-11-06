// Server-side ethers v6 helpers using admin private key from .env
// - Signs and sends tx via server wallet
// - Returns tx hash (after 1 confirmation)
// - Never import this module from client components

import { JsonRpcProvider, Wallet, Contract, parseUnits } from "ethers";
import { OUMG_ABI } from "../lib/abi/oumg";

const RPC_URL = process.env.OU_REUM_RPC ?? "https://testnet-rpc.oureum.com";
export const OUMG_ADDRESS = (process.env.OUMG_ADDRESS ??
  "0x86ea31421e159a9020378df039c23d55c6d0c62b") as `0x${string}`;

// Put your admin private key in .env as ADMIN_PRIVATE_KEY
const ADMIN_PK = process.env.ADMIN_PRIVATE_KEY;

/** Lazily create signer bound to RPC */
function getSigner() {
  if (!ADMIN_PK) throw new Error("Server not configured: missing ADMIN_PRIVATE_KEY");
  const provider = new JsonRpcProvider(RPC_URL);
  return new Wallet(ADMIN_PK, provider);
}

/** Contract instance with admin signer */
function getContract() {
  const signer = getSigner();
  return new Contract(OUMG_ADDRESS, OUMG_ABI, signer);
}

/** Utility: simple EVM address guard */
function assertAddress(addr: string, label = "address"): asserts addr is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) throw new Error(`Invalid ${label}`);
}

/** Read paused state (true = paused) */
export async function serverGetPaused(): Promise<boolean> {
  const c = getContract();
  return await c.paused();
}

/** Pause contract (requires PAUSER_ROLE on admin signer). Returns tx hash. */
export async function serverPause(): Promise<string> {
  const c = getContract();

  // Preflight: static call to surface AccessControl/logic reverts
  await c.pause.staticCall();

  // Gas estimate + buffer
  const gas = await c.pause.estimateGas();
  const gasLimit = (gas * 120n) / 100n;

  const tx = await c.pause({ gasLimit });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Pause tx not mined");
  if (receipt.status === 0) throw new Error("Pause tx reverted");
  return receipt.hash;
}

/** Resume contract (requires PAUSER_ROLE). Returns tx hash. */
export async function serverResume(): Promise<string> {
  const c = getContract();

  await c.unpause.staticCall();
  const gas = await c.unpause.estimateGas();
  const gasLimit = (gas * 120n) / 100n;

  const tx = await c.unpause({ gasLimit });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Unpause tx not mined");
  if (receipt.status === 0) throw new Error("Unpause tx reverted");
  return receipt.hash;
}

/** Mint OUMG with 6 decimals to target `to`. Returns tx hash after mined (1 conf). */
export async function serverMintOumg(to: `0x${string}`, grams: number): Promise<string> {
  assertAddress(to, "target address");
  if (!(grams > 0)) throw new Error("Amount must be greater than zero");

  const c = getContract();
  const amount = parseUnits(String(grams), 6);

  await c.mint.staticCall(to, amount);
  const gas = await c.mint.estimateGas(to, amount);
  const gasLimit = (gas * 120n) / 100n;

  const tx = await c.mint(to, amount, { gasLimit });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Mint tx not mined");
  if (receipt.status === 0) throw new Error("Mint tx reverted");
  return receipt.hash;
}

/** Admin-forced burn (burnFrom) using BURNER_ROLE. Amount in 6-decimal units (grams). */
export async function serverBurnOumg(from: `0x${string}`, grams: number): Promise<string> {
  assertAddress(from, "source address");
  if (!(grams > 0)) throw new Error("Amount must be greater than zero");

  const c = getContract();
  const amount = parseUnits(String(grams), 6);

  await c.burnFrom.staticCall(from, amount);
  const gas = await c.burnFrom.estimateGas(from, amount);
  const gasLimit = (gas * 120n) / 100n;

  const tx = await c.burnFrom(from, amount, { gasLimit });
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Burn tx not mined");
  if (receipt.status === 0) throw new Error("Burn tx reverted");
  return receipt.hash;
}

/** Helpers often used by UI/API */
export async function serverBalanceOf(addr: `0x${string}`): Promise<bigint> {
  assertAddress(addr, "address");
  const c = getContract();
  return await c.balanceOf(addr);
}

export async function serverTotalSupply(): Promise<bigint> {
  const c = getContract();
  return await c.totalSupply();
}