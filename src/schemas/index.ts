import { z } from "zod";

/** Admin preset funding */
export const fundPresetSchema = z.object({
  wallet: z.string().min(3),
  amountMyr: z.number().positive(),
});

/** Admin get balances (by wallet) */
export const getBalancesQuerySchema = z.object({
  wallet: z.string().min(3),
});

/** Legacy users list (limit/offset as strings from query) */
export const listUsersQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

/** Token ops: buy→mint (legacy direct endpoint) */
export const buyMintSchema = z.object({
  wallet: z.string().min(3),
  grams: z.number().positive(),
});

/** Token ops: sell→burn (legacy direct endpoint) */
export const sellBurnSchema = z.object({
  wallet: z.string().min(3),
  grams: z.number().positive(),
});

/** Redemption create (CASH / GOLD) */
export const redemptionCreateSchema = z.object({
  wallet: z.string().min(3),
  kind: z.enum(["CASH", "GOLD"]),
  grams: z.number().positive(),
  amountMyr: z.number().positive().optional(),
});

/** Redemption update (status) */
export const redemptionUpdateSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["APPROVED", "REJECTED", "COMPLETED"]),
  note: z.string().max(500).optional(),
});

/**
 * Price manual update
 * Accept EITHER single price (myrPerG) OR paired internal buy/sell.
 */
export const priceManualUpdateSchema = z.union([
  z.object({
    myrPerG: z.number().positive(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    myrPerG_buy: z.number().positive(),
    myrPerG_sell: z.number().positive(),
    note: z.string().max(500).optional(),
  }),
]);

/** Generic pagination for querystring */
export const paginationQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

/**
 * Admin purchase (deduct RM, increase OUMG)
 * - grams: positive number
 * - unit_price_myr_per_g: positive number
 * - note: optional text
 * - tx_hash: optional EVM tx hash (0x + 64 hex)
 * This schema is used for the body of POST /api/admin/users/:wallet/purchase
 */
export const adminPurchaseSchema = z.object({
  grams: z.number().positive(),
  unit_price_myr_per_g: z.number().positive(),
  note: z.string().max(500).optional(),
  tx_hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "invalid tx hash")
    .optional(),
});

/** Admin price current (manual override)
 * Accept EITHER:
 *  - { myrPerG, note? }
 *  - { myrPerG_buy, myrPerG_sell, note? }
 */
export const priceCurrentPostSchema = z.union([
  z.object({
    myrPerG: z.number().positive(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    myrPerG_buy: z.number().positive(),
    myrPerG_sell: z.number().positive(),
    note: z.string().max(500).optional(),
  }),
]);