import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: listings, error } = await supabase
    .from("seen_listings")
    .select("*")
    .order("first_seen_at", { ascending: false })
    .limit(20);

  const { data: counts } = await supabase
    .from("seen_listings")
    .select("target", { count: "exact", head: false });

  const targetCounts: Record<string, number> = {};
  if (counts) {
    for (const row of counts) {
      targetCounts[row.target] = (targetCounts[row.target] || 0) + 1;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-2">Njuskalo Scraper</h1>
        <p className="text-zinc-400 mb-8">
          Tracking apartment rentals. Total seen:{" "}
          {Object.values(targetCounts).reduce((a, b) => a + b, 0)} listings
          {Object.entries(targetCounts).map(([target, count]) => (
            <span key={target} className="ml-3 text-zinc-500">
              {target}: {count}
            </span>
          ))}
        </p>

        {error && (
          <p className="text-red-400 mb-4">
            Error loading listings: {error.message}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="pb-3 pr-4 font-medium">Title</th>
                <th className="pb-3 pr-4 font-medium">Price</th>
                <th className="pb-3 pr-4 font-medium">Location</th>
                <th className="pb-3 pr-4 font-medium">Size</th>
                <th className="pb-3 pr-4 font-medium">Target</th>
                <th className="pb-3 font-medium">Seen</th>
              </tr>
            </thead>
            <tbody>
              {listings?.map((listing) => (
                <tr
                  key={listing.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-900/50"
                >
                  <td className="py-3 pr-4 max-w-xs">
                    <a
                      href={listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-200 hover:text-white underline-offset-2 hover:underline"
                    >
                      {listing.title || listing.id}
                    </a>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-emerald-400">
                    {listing.price || "N/A"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-400">
                    {listing.location || "-"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-400 whitespace-nowrap">
                    {listing.size || "-"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-500">{listing.target}</td>
                  <td className="py-3 text-zinc-500 whitespace-nowrap">
                    {new Date(listing.first_seen_at).toLocaleDateString("hr-HR")}
                  </td>
                </tr>
              ))}
              {(!listings || listings.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No listings yet. Run the scraper to populate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
