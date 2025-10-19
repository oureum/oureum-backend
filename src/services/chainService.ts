/**
 * ChainService handles on-chain interactions with the OUMG smart contract.
 * You can later replace the internal stubs with real ethers/viem calls.
 *
 * Contract should expose at least:
 * - mint(to, grams)
 * - burn(from, grams)
 * - pause() / unpause()
 * - paused() view
 */
export namespace ChainService {
  // ==== TYPES ====

  type MintParams = { to: string; grams: number };
  type BurnParams = { from: string; grams: number };

  // ==== CONFIG ====
  const CONTRACT_ADDRESS = process.env.OUMG_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  const IS_SIMULATION = process.env.CHAIN_SIMULATE === "true"; // allow test mode

  // ==== CORE STUBS ====

  /** Simulate or perform a mint operation */
  export async function mintOUMG(p: MintParams): Promise<{ txHash: string }> {
    if (IS_SIMULATION) {
      return { txHash: fakeHash("mint") };
    }

    // TODO: replace this section with real ethers/viem call
    // Example:
    // const tx = await contract.write.mint([p.to, BigInt(p.grams * 1e8)]);
    // await tx.wait();
    return { txHash: fakeHash("mint") };
  }

  /** Simulate or perform a burn operation */
  export async function burnOUMG(p: BurnParams): Promise<{ txHash: string }> {
    if (IS_SIMULATION) {
      return { txHash: fakeHash("burn") };
    }

    // TODO: replace with real call
    return { txHash: fakeHash("burn") };
  }

  // ==== PAUSABILITY ====

  /** Pause contract (admin only) */
  export async function pause(): Promise<{ txHash: string }> {
    if (IS_SIMULATION) {
      return { txHash: fakeHash("pause") };
    }

    // TODO: call contract.write.pause()
    return { txHash: fakeHash("pause") };
  }

  /** Unpause contract (admin only) */
  export async function unpause(): Promise<{ txHash: string }> {
    if (IS_SIMULATION) {
      return { txHash: fakeHash("unpause") };
    }

    // TODO: call contract.write.unpause()
    return { txHash: fakeHash("unpause") };
  }

  /** Check paused state */
  export async function isPaused(): Promise<boolean> {
    if (IS_SIMULATION) {
      // For demo, randomly return true/false to simulate paused state
      return Math.random() > 0.7;
    }

    // TODO: contract.read.paused()
    return false;
  }

  // ==== UTIL ====

  function fakeHash(prefix: string) {
    const rnd = Math.random().toString(16).slice(2);
    return "0x" + prefix.slice(0, 4) + rnd.padEnd(64, "0");
  }
}