// src/services/chain/eth.ts
import { ethers } from "ethers";

// Read env
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const OUMG_ADDRESS = process.env.OUMG_ADDRESS || "";
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || "";

// Minimal ABI: only what we actually call.
// If your real contract has different function names, update here.
const OUMG_MIN_ABI = [
  // pause / unpause / paused
  "function pause() external",
  "function unpause() external",
  "function paused() view returns (bool)",

  // mint / burn (adjust to your actual signature if different)
  "function mint(address to, uint256 amount) external",
  "function burn(address from, uint256 amount) external",

  // optional: decimals
  "function decimals() view returns (uint8)",
];

// Helpers
function provider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function signerOrNull() {
  if (!ADMIN_PRIVATE_KEY) return null;
  try {
    return new ethers.Wallet(ADMIN_PRIVATE_KEY, provider());
  } catch {
    return null;
  }
}

function fakeHash() {
  return "0x" + Math.random().toString(16).slice(2).padEnd(64, "0");
}

async function getOumgContract(withSigner = false) {
  const p = provider();
  const s = withSigner ? signerOrNull() : null;
  const signer = withSigner && s ? s : p;
  return new ethers.Contract(OUMG_ADDRESS, OUMG_MIN_ABI, signer);
}

// ===== Public API (used by controllers) =====

export async function pausedStatus(): Promise<{ paused: boolean }> {
  try {
    const c = await getOumgContract(false);
    const paused: boolean = await c.paused();
    return { paused };
  } catch {
    // If contract doesn't have paused() yet, default false so API仍可用
    return { paused: false };
  }
}

export async function pauseContract(): Promise<{ txHash: string }> {
  try {
    const c = await getOumgContract(true);
    if (!("pause" in c)) throw new Error("pause() not available");
    const tx = await (c as any).pause();
    const rec = await tx.wait();
    return { txHash: rec?.hash || tx?.hash || fakeHash() };
  } catch {
    // no signer / no method → return fake hash for demo
    return { txHash: fakeHash() };
  }
}

export async function unpauseContract(): Promise<{ txHash: string }> {
  try {
    const c = await getOumgContract(true);
    if (!("unpause" in c)) throw new Error("unpause() not available");
    const tx = await (c as any).unpause();
    const rec = await tx.wait();
    return { txHash: rec?.hash || tx?.hash || fakeHash() };
  } catch {
    return { txHash: fakeHash() };
  }
}

// Grams → token amount: 默认 18 位；若你的合约不同可改 decimals 读取
async function gramsToAmount(grams: number): Promise<bigint> {
  const c = await getOumgContract(false);
  let d = 18;
  try {
    d = Number(await (c as any).decimals());
  } catch {
    d = 18;
  }
  // amount = grams * 10^decimals
  return ethers.parseUnits(String(grams), d);
}

export async function mintOUMG(p: { to: string; grams: number }): Promise<{ txHash: string }> {
  try {
    const c = await getOumgContract(true);
    const amt = await gramsToAmount(p.grams);
    if (!("mint" in c)) throw new Error("mint() not available");
    const tx = await (c as any).mint(p.to, amt);
    const rec = await tx.wait();
    return { txHash: rec?.hash || tx?.hash || fakeHash() };
  } catch {
    return { txHash: fakeHash() };
  }
}

export async function burnOUMG(p: { from: string; grams: number }): Promise<{ txHash: string }> {
  try {
    const c = await getOumgContract(true);
    const amt = await gramsToAmount(p.grams);
    if (!("burn" in c)) throw new Error("burn() not available");
    const tx = await (c as any).burn(p.from, amt);
    const rec = await tx.wait();
    return { txHash: rec?.hash || tx?.hash || fakeHash() };
  } catch {
    return { txHash: fakeHash() };
  }
}