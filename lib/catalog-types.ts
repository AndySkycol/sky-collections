export type Product = {
  id?: string;
  name: string;
  detail?: string;
  price: number;
  stock: number;
  image: string;
  category: string;
  published?: number;
  country?: string;
  team?: string;
  numbered?: boolean;
  patch?: boolean;
  signature?: boolean;
};

export type PriceOption = { spots: number; price: number };

export type BreakItem = {
  id: string;
  title: string;
  description: string;
  image: string;
  priceOptions: PriceOption[];
  spotsTotal: number;
  spotsAvailable: number;
  status: "active" | "past";
  published?: number;
};

export type CatalogSnapshot = {
  products: Product[];
  breaks: BreakItem[];
  finance?: import("./finance-types").FinanceData;
};

export function isCatalogSnapshot(value: unknown): value is CatalogSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CatalogSnapshot>;
  return Array.isArray(candidate.products) && Array.isArray(candidate.breaks);
}
