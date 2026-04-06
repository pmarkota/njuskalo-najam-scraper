import { NextRequest } from "next/server";
import { SCRAPE_TARGETS } from "@/config/targets";
import { supabase } from "@/lib/supabase";
import { scrapeMultipleTargets, scrapeAllPages } from "@/lib/scraper";
import { sendDiscordNotification } from "@/lib/discord";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seedMode = request.nextUrl.searchParams.get("seed") === "true";
  const results = [];

  if (seedMode) {
    // Seed mode: scrape all pages per target (run locally, no Vercel timeout)
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
          new: listings.length,
          seeded: true,
        });
      } catch (error) {
        console.error(`[scrape] Seed error for ${target.name}:`, error);
        results.push({ target: target.name, error: String(error) });
      }
    }
  } else {
    // Normal mode: one browser, page 1 for all targets
    const urls = SCRAPE_TARGETS.map((t) => t.njuskaloUrl);
    const scraped = await scrapeMultipleTargets(urls);

    for (const target of SCRAPE_TARGETS) {
      try {
        const listings = scraped.get(target.njuskaloUrl) || [];

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
          results.push({
            target: target.name,
            found: listings.length,
            new: 0,
          });
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

        for (const listing of newListings) {
          await sendDiscordNotification(target.discordWebhookUrl, {
            ...listing,
            target: target.name,
          });
        }

        results.push({
          target: target.name,
          found: listings.length,
          new: newListings.length,
        });
      } catch (error) {
        console.error(`[scrape] Error for ${target.name}:`, error);
        results.push({ target: target.name, error: String(error) });
      }
    }
  }

  return Response.json({
    success: true,
    results,
    timestamp: new Date().toISOString(),
  });
}
