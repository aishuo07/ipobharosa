export type RegistrarCompany = { id: string; name: string };

export type RegistrarKey = "kfin" | "bigshare" | "maashitla" | "mufg" | "cameo" | "skyline" | "purva" | "mas";

export interface CacheEntry {
  data: RegistrarCompany[];
  timestamp: number;
}

export interface FetchOptions {
  force?: boolean;
}
