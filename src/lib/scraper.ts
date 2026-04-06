import * as cheerio from "cheerio";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

export interface Listing {
  id: string;
  title: string;
  price: string;
  location: string;
  url: string;
  image_url: string;
  size: string;
}

// Remote chromium pack for Vercel (must match @sparticuz/chromium-min version)
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";

async function launchBrowser(): Promise<Browser> {
  const isLocal = !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.VERCEL;

  return puppeteer.launch({
    args: isLocal ? [] : chromium.args,
    executablePath: isLocal
      ? process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : process.platform === "win32"
          ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
          : "/usr/bin/google-chrome"
      : await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });
}

async function setupPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "hr-HR,hr;q=0.9,en;q=0.8",
  });
  return page;
}

async function fetchPageHtml(
  page: Page,
  url: string
): Promise<{ html: string; finalUrl: string }> {
  console.log(`[scraper] Navigating to ${url}`);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

  await page
    .waitForSelector("li.EntityList-item", { timeout: 15000 })
    .catch(() => {
      console.warn(`[scraper] Timeout waiting for EntityList-item selector`);
    });

  const finalUrl = page.url();
  const html = await page.content();
  console.log(`[scraper] Got ${html.length} chars of HTML from ${finalUrl}`);
  return { html, finalUrl };
}

function parseListings(html: string): Listing[] {
  if (!html.includes("EntityList-item")) {
    console.error(
      `[scraper] No EntityList-item in HTML (length: ${html.length}). Possible block.`
    );
    return [];
  }

  const $ = cheerio.load(html);
  const listings: Listing[] = [];

  const items = $("li.EntityList-item--VauVau, li.EntityList-item--Regular");

  items.each((_, el) => {
    try {
      const $item = $(el);
      const $article = $item.find("article.entity-body");

      const $titleLink = $article.find("h3.entity-title > a.link");
      const id = $titleLink.attr("name") || "";
      const relativeUrl = $titleLink.attr("href") || "";
      const url = relativeUrl ? `https://www.njuskalo.hr${relativeUrl}` : "";
      const title = $titleLink.find("span").text().trim();

      if (!id || !url) return;

      const image_url =
        $article.find("img.entity-thumbnail-img").attr("src") || "";
      const price = $article.find("strong.price").first().text().trim();

      const $desc = $article.find("div.entity-description");
      const descText = $desc.text();

      const sizeMatch = descText.match(/Stambena površina:\s*([\d.,]+\s*m2)/);
      const size = sizeMatch ? sizeMatch[1].trim() : "";

      const locationMatch = descText.match(/Lokacija:\s*(.+?)(?:\n|$)/);
      const location = locationMatch ? locationMatch[1].trim() : "";

      listings.push({ id, title, price, location, url, image_url, size });
    } catch (err) {
      console.error(`[scraper] Error parsing listing item:`, err);
    }
  });

  return listings;
}

function addPageParam(baseUrl: string, pageNum: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("page", String(pageNum));
  return url.toString();
}

/** Scrape page 1 only — used by normal cron runs */
export async function scrapeListings(searchUrl: string): Promise<Listing[]> {
  const browser = await launchBrowser();
  try {
    const page = await setupPage(browser);
    const { html } = await fetchPageHtml(page, searchUrl);
    const listings = parseListings(html);
    console.log(`[scraper] Page 1: ${listings.length} listings`);
    return listings;
  } catch (err) {
    console.error(`[scraper] Failed to scrape ${searchUrl}:`, err);
    return [];
  } finally {
    await browser.close();
  }
}

/** Scrape ALL pages — used by seed mode locally (no timeout) */
export async function scrapeAllPages(searchUrl: string): Promise<Listing[]> {
  const browser = await launchBrowser();
  try {
    const page = await setupPage(browser);
    const allListings: Listing[] = [];
    let pageNum = 1;

    while (true) {
      const url = pageNum === 1 ? searchUrl : addPageParam(searchUrl, pageNum);
      const { html, finalUrl } = await fetchPageHtml(page, url);

      // Njuškalo redirects to page 1 when you request a page beyond the last.
      // Detect this: if we asked for page N>1 but the final URL has no "page=" param, stop.
      if (pageNum > 1 && !finalUrl.includes(`page=${pageNum}`)) {
        console.log(
          `[scraper] Page ${pageNum} redirected to ${finalUrl} — reached end of listings`
        );
        break;
      }

      const listings = parseListings(html);

      console.log(
        `[scraper] Page ${pageNum}: ${listings.length} listings (total: ${allListings.length + listings.length})`
      );

      if (listings.length === 0) break;

      allListings.push(...listings);
      pageNum++;

      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(
      `[scraper] Seed complete: ${allListings.length} listings across ${pageNum - 1} pages`
    );
    return allListings;
  } catch (err) {
    console.error(`[scraper] Failed to scrape all pages:`, err);
    return [];
  } finally {
    await browser.close();
  }
}
