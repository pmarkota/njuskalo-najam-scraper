import { NextRequest } from "next/server";
import { SCRAPE_TARGETS } from "@/config/targets";
import { supabase } from "@/lib/supabase";
import { scrapeListings, scrapeAllPages } from "@/lib/scraper";
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
      const listings = seedMode
        ? await scrapeAllPages(target.njuskaloUrl)
        : await scrapeListings(target.njuskaloUrl);

      if (listings.length === 0) {
        results.push({ target: target.name, found: 0, new: 0 });
        continue;
      }

      // Check Supabase for already-seen listing IDs
      const listingIds = listings.map((l) => l.id);
      const { data: existing, error: selectError } = await supabase
        .from("seen_listings")
        .select("id")
        .in("id", listingIds);

      if (selectError) {
        console.error(
          `[scrape] Supabase select error for ${target.name}:`,
          selectError
        );
      }

      const existingIds = new Set((existing || []).map((e) => e.id));
      const newListings = listings.filter((l) => !existingIds.has(l.id));

      if (newListings.length === 0) {
        results.push({ target: target.name, found: listings.length, new: 0 });
        continue;
      }

      // Upsert new listings into Supabase (ignoreDuplicates handles race conditions)
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
        console.error(
          `[scrape] Supabase insert error for ${target.name}:`,
          insertError
        );
      }

      // Send Discord notifications (skip in seed mode)
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
        seeded: seedMode,
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
