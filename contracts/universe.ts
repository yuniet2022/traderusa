import type { Asset } from "../src/types";

export interface UniverseAsset extends Asset {
  catalogSources: string[];
}
export interface CatalogSource {
  id: string;
  name: string;
  status: "ok" | "stale" | "unavailable";
  count: number;
  fetchedAt: number | null;
  error: string | null;
}
export interface UniversePage {
  version: string;
  assets: UniverseAsset[];
  total: number;
  stocks: number;
  crypto: number;
  nextOffset: number | null;
  sources: CatalogSource[];
  partial: boolean;
}
