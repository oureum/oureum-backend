import { z } from "zod";

export const fundPresetSchema = z.object({
  wallet: z.string().min(3),
  amountMyr: z.number().positive(),
});

export const getBalancesQuerySchema = z.object({
  wallet: z.string().min(3),
});

export const listUsersQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

export const buyMintSchema = z.object({
  wallet: z.string().min(3),
  grams: z.number().positive(),
});

export const sellBurnSchema = z.object({
  wallet: z.string().min(3),
  grams: z.number().positive(),
});

export const redemptionCreateSchema = z.object({
  wallet: z.string().min(3),
  kind: z.enum(["CASH", "GOLD"]),
  grams: z.number().positive(),
  amountMyr: z.number().positive().optional(),
});

export const redemptionUpdateSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["APPROVED", "REJECTED", "COMPLETED"]),
  note: z.string().max(500).optional(),
});

/** Accept EITHER single price OR buy/sell pair. */
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

export const paginationQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});