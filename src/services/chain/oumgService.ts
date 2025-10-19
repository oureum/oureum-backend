/**
 * Temporary placeholder for OUMG chain operations.
 * Provides fake data for local/off-chain testing.
 */

function fakeHash() {
  return "0x" + Math.random().toString(16).slice(2).padEnd(64, "0");
}

/** In-memory paused flag. */
let _paused = false;

export const OumgService = {
  /** Fake ERC20-style metadata. */
  async getTokenMeta() {
    return {
      name: "Oureum Gold Token",
      symbol: "OUMG",
      decimals: 8,
      totalSupply: "100000000000000", // 1 million * 1e8
      address: process.env.OUMG_ADDRESS || "0x0000000000000000000000000000000000000000",
    };
  },

  /** Fake OUMG Info contract data. */
  async getInfo() {
    return {
      totalGoldGrams: 12345.6789,
      totalUsers: 10,
      version: "test-mock",
      lastUpdated: new Date().toISOString(),
    };
  },

  /** Mint placeholder (admin only). */
  async mint(to: string, grams: number) {
    if (_paused) throw new Error("Contract is paused");
    return { txHash: fakeHash(), to, grams };
  },

  /** Burn placeholder (admin only). */
  async burn(from: string, grams: number) {
    if (_paused) throw new Error("Contract is paused");
    return { txHash: fakeHash(), from, grams };
  },

  /** Read paused() */
  async paused() {
    return { paused: _paused };
  },

  /** Pause contract (admin-only in real version). */
  async pause() {
    _paused = true;
    return { txHash: fakeHash(), paused: _paused };
  },

  /** Unpause contract (admin-only in real version). */
  async unpause() {
    _paused = false;
    return { txHash: fakeHash(), paused: _paused };
  },
};