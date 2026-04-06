import { NextRequest } from "next/server";
import { SCRAPE_TARGETS } from "@/config/targets";
import { supabase } from "@/lib/supabase";
import { scrapeListings, scrapePageBatch } from "@/lib/scraper";
import { sendDiscordNotification } from "@/lib/discord";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seedMode = request.nextUrl.searchParams.get("seed") === "true";

  // Seed mode: scrape one target, 2 pages per request
  // Params: target=0|1, from=pageNumber
  if (seedMode) {
    const targetIdx = parseInt(
      request.nextUrl.searchParams.get("target") || "0"
    );
    const fromPage = parseInt(
      request.nextUrl.searchParams.get("from") || "1"
    );

    if (targetIdx < 0 || targetIdx >= SCRAPE_TARGETS.length) {
      return Response.json({ error: "Invalid target index" }, { status: 400 });
    }

    const target = SCRAPE_TARGETS[targetIdx];

    try {
      const { listings, hasMore } = await scrapePageBatch(
        target.njuskaloUrl,
        fromPage,
        2
      );

      if (listings.length > 0) {
        const { error: insertError } = await supabase
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

        if (insertError) {
          console.error(`[seed] Supabase error:`, insertError);
        }
      }

      // Build the next URL for the caller
      let nextCall: string | null = null;
      if (hasMore) {
        nextCall = `?key=KEY&seed=true&target=${targetIdx}&from=${fromPage + 2}`;
      } else if (targetIdx + 1 < SCRAPE_TARGETS.length) {
        nextCall = `?key=KEY&seed=true&target=${targetIdx + 1}&from=1`;
      }

      return Response.json({
        success: true,
        target: target.name,
        pages: `${fromPage}-${fromPage + 1}`,
        inserted: listings.length,
        hasMore,
        nextCall,
        done: !nextCall,
      });
    } catch (error) {
      return Response.json({
        success: false,
        target: target.name,
        error: String(error),
      });
    }
  }

  // Normal mode: page 1 only for each target
  const results = [];

  for (const target of SCRAPE_TARGETS) {
    try {
      const listings = await scrapeListings(target.njuskaloUrl);

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

      const { error: insertError } = await supabase
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

      if (insertError) {
        console.error(`[scrape] Supabase insert error:`, insertError);
      }

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

  return Response.json({
    success: true,
    results,
    timestamp: new Date().toISOString(),
  });
}
