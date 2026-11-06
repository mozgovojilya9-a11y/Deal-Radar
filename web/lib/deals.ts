export type Deal = {
  listing_id: string;
  title: string;
  description: string | null;
  price: number;
  market_price: number;
  discount: number;
  category_key: string;
  category_label: string;
  model_group: string | null;
  city: string | null;
  distance_km: number | null;
  listing_url: string;
  image_url: string | null;
  warning_flags: string[] | null;
  posted_at: string | null;
  detected_at: string;
  active: boolean;
};

export type ScannerStats = {
  checked: number;
  accepted: number;
  candidates: number;
  newDeals: number;
  rejectedAge: number;
  rejectedRisk: number;
  rejectedSamples: number;
  rejectedDiscount: number;
  rejectedTotal: number;
  failedQueries: number;
  queryCount: number;
  finishedAt: string;
};

export type DealFeed = {
  updatedAt: string | null;
  scannedAt?: string | null;
  scannerStats?: ScannerStats | null;
  deals: Deal[];
};
