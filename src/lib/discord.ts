export interface DiscordListing {
  title: string;
  price: string;
  location: string;
  url: string;
  image_url: string;
  size: string;
  target: string;
}

export async function sendDiscordNotification(
  webhookUrl: string,
  listing: DiscordListing
): Promise<void> {
  const embed = {
    title: listing.title || "Novi oglas",
    url: listing.url,
    color: 0x00b894,
    fields: [
      { name: "\u{1F4B0} Cijena", value: listing.price || "N/A", inline: true },
      {
        name: "\u{1F4CD} Lokacija",
        value: listing.location || "N/A",
        inline: true,
      },
      ...(listing.size
        ? [{ name: "\u{1F4D0} Veli\u010Dina", value: listing.size, inline: true }]
        : []),
    ],
    image: listing.image_url ? { url: listing.image_url } : undefined,
    footer: { text: `Nju\u0161kalo Scraper \u2022 ${listing.target}` },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    console.error(
      `[discord] Webhook error ${res.status}: ${await res.text().catch(() => "")}`
    );
  }

  // Discord rate limit: wait 1 second between messages
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
