import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: absolute("/sitemap.xml"),
  };
}
