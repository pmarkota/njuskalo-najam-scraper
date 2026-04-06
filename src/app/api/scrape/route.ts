import { NextRequest } from "next/server";
import { SCRAPE_TARGETS } from "@/config/targets";
import { supabase } from "@/lib/supabase";
import { scrapeAllPages } from "@/lib/scraper";

// Seed-only endpoint — run locally to populate DB before enabling Inngest cron
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = [];

  for (const target of SCRAPE_TARGETS) {
    try {
      const listings = await scrapeAllPages(target.njuskaloUrl);

      if (listings.length > 0) {
        await supabase
          .from("seen_listings")
          .upsert(
            listings.map((l) => ({
              id: l.id,
              title: l.title,
              price: l.price,
              location: l.location,
              url: l.url,
              image_url: l.image_url,
              size: l.size,
              target: target.slug,
            })),
            { onConflict: "id", ignoreDuplicates: true }
          );
      }

      results.push({
        target: target.name,
        found: listings.length,
        seeded: true,
      });
    } catch (error) {
      console.error(`[seed] Error for ${target.name}:`, error);
      results.push({ target: target.name, error: String(error) });
    }
  }

  return Response.json({ success: true, results });
}
