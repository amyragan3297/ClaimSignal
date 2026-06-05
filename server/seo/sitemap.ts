import { TERMS } from "./glossary";
import { CARRIERS } from "./carriers";
import { LOSS_TYPES } from "./claim-patterns";

const BASE = "https://Claimsignal1.com";

function url(loc: string, priority: string, changefreq: string): string {
  return `  <url>
    <loc>${BASE}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
  </url>`;
}

export function generateSitemap(): string {
  const urls: string[] = [];

  urls.push(url("/learn", "0.9", "weekly"));
  for (const t of TERMS) {
    urls.push(url(`/learn/${t.slug}`, "0.8", "monthly"));
  }

  urls.push(url("/carriers", "0.9", "weekly"));
  for (const c of CARRIERS) {
    urls.push(url(`/carriers/${c.slug}`, "0.8", "monthly"));
  }

  urls.push(url("/claims", "0.9", "weekly"));
  for (const c of CARRIERS) {
    urls.push(url(`/claims/${c.slug}`, "0.7", "monthly"));
    for (const l of c.lossTypesCommon) {
      const lSlug = l.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const ltExists = LOSS_TYPES.some((lt) => lt.slug === lSlug || lt.label.toLowerCase() === l.toLowerCase());
      if (ltExists) {
        urls.push(url(`/claims/${c.slug}/${lSlug}`, "0.7", "monthly"));
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}
