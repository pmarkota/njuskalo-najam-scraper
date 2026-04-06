import { inngest } from "./client";
import { SCRAPE_TARGETS } from "@/config/targets";
import { scrapeSingleTarget, type Listing } from "@/lib/scraper";
import { supabase } from "@/lib/supabase";
import { sendDiscordNotification } from "@/lib/discord";

export const scrapeNjuskalo = inngest.createFunction(
  {
    id: "scrape-njuskalo",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const results = [];

    for (const target of SCRAPE_TARGETS) {
      // Step 1: Scrape with headless browser (own invocation, up to 60s)
      const listings = await step.run(
        `scrape-${target.slug}`,
        async () => {
          return await scrapeSingleTarget(target.njuskaloUrl);
        }
      );

      if (listings.length === 0) {
        results.push({ target: target.name, found: 0, new: 0 });
        continue;
      }

      // Step 2: Check DB + insert + notify (own invocation)
      const result = await step.run(
        `process-${target.slug}`,
        async () => {
          const listingIds = listings.map((l: Listing) => l.id);
          const { data: existing } = await supabase
            .from("seen_listings")
            .select("id")
            .in("id", listingIds);

          const existingIds = new Set(
            (existing || []).map((e: { id: string }) => e.id)
          );
          const newListings = listings.filter(
            (l: Listing) => !existingIds.has(l.id)
          );

          if (newListings.length === 0) {
            return { target: target.name, found: listings.length, new: 0 };
          }

          await supabase
            .from("seen_listings")
            .upsert(
              newListings.map((l: Listing) => ({
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

          return {
            target: target.name,
            found: listings.length,
            new: newListings.length,
          };
        }
      );

      results.push(result);
    }

    return { success: true, results };
  }
);
