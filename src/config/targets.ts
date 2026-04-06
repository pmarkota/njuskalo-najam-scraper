export interface ScrapeTarget {
  name: string;
  slug: string;
  njuskaloUrl: string;
  discordWebhookUrl: string;
}

export const SCRAPE_TARGETS: ScrapeTarget[] = [
  {
    name: "Zagreb",
    slug: "zagreb",
    njuskaloUrl:
      "https://www.njuskalo.hr/iznajmljivanje-stanova/zagreb?price%5Bmin%5D=500&price%5Bmax%5D=800",
    discordWebhookUrl:
      "https://discord.com/api/webhooks/1490837321724203048/D2g8YuebsjrgWFplUGgagy8gZYbgYV9bVXM2oUYny0C1dZcl9HCsw_SwTyPVyRK9zlLh",
  },
  {
    name: "Okolica",
    slug: "okolica",
    njuskaloUrl:
      "https://www.njuskalo.hr/iznajmljivanje-stanova?geo%5BlocationIds%5D=1170%2C1253%2C1258%2C1260&price%5Bmin%5D=500&price%5Bmax%5D=800",
    discordWebhookUrl:
      "https://discord.com/api/webhooks/1490837603530833941/R2uFp-GHTZ4S1MR9SMehM259xMN1lis2Xtdz9fCh2lFmzcaXsOs2X5YyeTkoVK-3ZbAe",
  },
];
