import { z } from 'zod';

export const marketSymbol = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.^=-]{0,19}$/);
export const marketClass = z.enum(['stock', 'crypto']);
export const marketTimeframe = z.enum(['scan', '1m', '5m', '15m', '1h', '1d', '1wk']);
export type MarketTimeframe = z.infer<typeof marketTimeframe>;
