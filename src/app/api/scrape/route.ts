import { NextRequest } from "next/server";
import { SCRAPE_TARGETS } from "@/config/targets";
import { supabase } from "@/lib/supabase";
import { scrapeFast, scrapeAllPages } from "@/lib/scraper";
import { sendDiscordNotification } from "@/lib/discord";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seedMode = request.nextUrl.searchParams.get("seed") === "true";
  const results = [];

  for (const target of SCRAPE_TARGETS) {
    try {
      // Seed: headless browser, all pages (local only).
      // Cron: fast fetch(), page 1 only. Returns [] if blocked — retries next cycle.
      const listings = seedMode
        ? await scrapeAllPages(target.njuskaloUrl)
        : await scrapeFast(target.njuskaloUrl);

      if (listings.length === 0) {
        results.push({ target: target.name, found: 0, new: 0 });
        continue;
      }

      const listingIds = listings.map((l) => l.id);
      const { data: existing } = await supabase
        .from("seen_listings")
        .select("id")
        .in("id", listingIds);

      const existingIds = new Set((existing || []).map((e) => e.id));
      const newListings = listings.filter((l) => !existingIds.has(l.id));

      if (newListings.length === 0) {
        results.push({ target: target.name, found: listings.length, new: 0 });
        continue;
      }

      await supabase
        .from("seen_listings")
        .upsert(
          newListings.map((l) => ({
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

      if (!seedMode) {
        for (const listing of newListings) {
          await sendDiscordNotification(target.discordWebhookUrl, {
            ...listing,
            target: target.name,
          });
        }
      }

      results.push({
        target: target.name,
        found: listings.length,
        new: newListings.length,
        seeded: seedMode || undefined,
      });
    } catch (error) {
      console.error(`[scrape] Error for ${target.name}:`, error);
      results.push({ target: target.name, error: String(error) });
    }
  }

  return Response.json({
    success: true,
    results,
    timestamp: new Date().toISOString(),
  });
}
