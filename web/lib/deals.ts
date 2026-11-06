export type DealStatus = "strong" | "good" | "candidate";

export type Deal = {
  listing_id: string;
  title: string;
  description: string | null;
  price: number;
  market_price: number | null;
  discount: number | null;
  status?: DealStatus;
  market_confidence?: "high" | "preliminary" | "none";
  market_samples?: number;
  evaluation_reason?: string | null;
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
  unique: number;
  duplicates: number;
  rejectedTitle: number;
  rejectedInvalid: number;
  rejectedPriceType: number;
  rejectedPriceRange: number;
  rejectedDistance: number;
  accepted: number;
  candidates: number;
  strongDeals: number;
  goodDeals: number;
  reviewCandidates: number;
  newDeals: number;
  alreadyPublished: number;
  rejectedAge: number;
  rejectedDateUnknown: number;
  rejectedRisk: number;
  rejectedDiscount: number;
  candidateNoMarket: number;
  candidatePreliminary: number;
  primaryRejected: number;
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
