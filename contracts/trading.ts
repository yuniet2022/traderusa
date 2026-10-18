import { z } from "zod";

const price = z.number().finite().positive().max(1e12);
export const costsSchema = z.object({
  feePercent: z.number().finite().min(0).max(10),
  fixedFee: z.number().finite().min(0).max(10000),
  slippagePercent: z.number().finite().min(0).max(10),
});
export type TradingCosts = z.infer<typeof costsSchema>;
export const planSchema = costsSchema
  .extend({
    assetId: z.string().min(1).max(64),
    symbol: z.string().min(1).max(32),
    assetClass: z.enum(["stock", "crypto"]),
    horizon: z.enum(["intraday", "swing"]),
    entry: price,
    stop: price,
    target: price,
    riskPercent: z.number().finite().positive().max(5),
    note: z.string().trim().max(500).default(""),
  })
  .refine(p => p.stop < p.entry && p.target > p.entry, {
    message:
      "La compra necesita stop inferior a la entrada y objetivo superior.",
  });
export type TradingPlan = z.infer<typeof planSchema>;
export type PaperSizing = {
  quantity: number;
  entryFill: number;
  entryFee: number;
  capitalUsed: number;
  estimatedLoss: number;
  estimatedGain: number;
};
export type PaperSnapshot = TradingPlan & PaperSizing;

/** Long-only accounting, adverse slippage on each side. All amounts are USD. */
export function settleLong(
  quantity: number,
  entryFill: number,
  entryFee: number,
  exit: number,
  costs: TradingCosts
) {
  if (![quantity, entryFill, exit].every(n => Number.isFinite(n) && n > 0))
    throw new Error("Precio o cantidad inválidos.");
  const exitFill = exit * (1 - costs.slippagePercent / 100);
  const exitFee =
    (quantity * exitFill * costs.feePercent) / 100 + costs.fixedFee;
  const net = quantity * (exitFill - entryFill) - entryFee - exitFee;
  return { exitFill, exitFee, net, proceeds: quantity * exitFill - exitFee };
}
