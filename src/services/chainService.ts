/**
 * ChainService is a placeholder for on-chain interactions.
 * Later you can wire ethers/viem with contract addresses & ABIs.
 */
export namespace ChainService {
  type MintParams = {
    to: string;       // user wallet
    grams: number;    // amount in grams
  };

  type BurnParams = {
    from: string;     // user wallet
    grams: number;
  };

  export async function mintOUMG(p: MintParams): Promise<{ txHash: string }> {
    // TODO: implement real on-chain mint
    // Return a fake tx hash for now
    return { txHash: fakeHash() };
  }

  export async function burnOUMG(p: BurnParams): Promise<{ txHash: string }> {
    // TODO: implement real on-chain burn
    return { txHash: fakeHash() };
  }

  function fakeHash() {
    return "0x" + Math.random().toString(16).slice(2).padEnd(64, "0");
  }
}