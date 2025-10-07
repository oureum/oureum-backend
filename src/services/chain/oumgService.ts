import { Oumg, Info, Price } from "./eth";

export const OumgService = {
  // read
  async getTokenMeta() {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      Oumg.name(),
      Oumg.symbol(),
      Oumg.decimals(),
      Oumg.totalSupply(),
    ]);
    return { name, symbol, decimals: Number(decimals), totalSupply: totalSupply.toString() };
  },

  async getPrice() {
    const [buy, sell, ts, dec] = await Promise.all([
      Price.buyMyrPerG(),
      Price.sellMyrPerG(),
      Price.lastUpdated(),
      Price.decimals(),
    ]);
    return {
      buyMyrPerG: buy.toString(),   // 6 decimals string
      sellMyrPerG: sell.toString(), // 6 decimals string
      lastUpdated: Number(ts),
      decimals: Number(dec),
    };
  },

  async getInfo() {
    const [
      weightUnit, purityPpm, custodyType, spreadBps,
      redemptionMinGram, redemptionFeeBps, redemptionMinUnitMg,
      goldSource, vaultLocation, insuranceNote, auditRef,
      priceFeedSource, serialPolicy, ipfsCID
    ] = await Promise.all([
      Info.weightUnit(),
      Info.purityPpm(),
      Info.custodyType(),
      Info.spreadBps(),
      Info.redemptionMinGram(),
      Info.redemptionFeeBps(),
      Info.redemptionMinUnitMg(),
      Info.goldSource(),
      Info.vaultLocation(),
      Info.insuranceNote(),
      Info.auditRef(),
      Info.priceFeedSource(),
      Info.serialPolicy(),
      Info.ipfsCID(),
    ]);

    return {
      weightUnit,
      purityPpm: Number(purityPpm),
      custodyType: Number(custodyType), // 0=UNALLOCATED,1=ALLOCATED
      spreadBps: Number(spreadBps),
      redemptionMinGram: Number(redemptionMinGram),
      redemptionFeeBps: Number(redemptionFeeBps),
      redemptionMinUnitMg: Number(redemptionMinUnitMg),
      goldSource,
      vaultLocation,
      insuranceNote,
      auditRef,
      priceFeedSource,
      serialPolicy,
      ipfsCID,
    };
  },

  // write (admin)
  async setPrice({ buyMyrPerG, sellMyrPerG }: { buyMyrPerG: string; sellMyrPerG: string; }) {
    // buy/sell are strings of integer in 6 decimals (e.g., "500000000")
    const tx = await Price.setPrice(buyMyrPerG, sellMyrPerG);
    const rc = await tx.wait();
    return { txHash: rc?.hash ?? tx.hash };
  },
};