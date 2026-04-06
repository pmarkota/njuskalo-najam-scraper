import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scrapeNjuskalo } from "@/inngest/scrape";

export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scrapeNjuskalo],
});
