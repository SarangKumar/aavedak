import "server-only";

export type LinkPreview = {
  imageUrl: string | null;
  faviconUrl: string | null;
  title: string | null;
};

function absolutize(base: URL, href: string | null | undefined): string | null {
  const raw = href?.trim();
  if (!raw) return null;
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`,
    "i",
  );
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function linkHref(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]+rel=["'][^"']*${rel}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const re2 = new RegExp(
    `<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${rel}[^"']*["'][^>]*>`,
    "i",
  );
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m?.[1]?.trim();
  return t || null;
}

/** Fetch OG image + favicon for a public https URL (best-effort). */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }

  const fallbackFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AavedakLinkPreview/1.0 (+https://aavedak.com)",
      },
    });
    if (!res.ok) {
      return { imageUrl: null, faviconUrl: fallbackFavicon, title: null };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { imageUrl: null, faviconUrl: fallbackFavicon, title: null };
    }
    const html = (await res.text()).slice(0, 250_000);
    const finalUrl = new URL(res.url || url.toString());

    const imageUrl =
      absolutize(finalUrl, metaContent(html, "og:image")) ||
      absolutize(finalUrl, metaContent(html, "twitter:image")) ||
      null;

    const faviconUrl =
      absolutize(finalUrl, linkHref(html, "apple-touch-icon")) ||
      absolutize(finalUrl, linkHref(html, "icon")) ||
      absolutize(finalUrl, linkHref(html, "shortcut icon")) ||
      absolutize(finalUrl, "/favicon.ico") ||
      fallbackFavicon;

    return {
      imageUrl,
      faviconUrl,
      title: pageTitle(html),
    };
  } catch {
    return { imageUrl: null, faviconUrl: fallbackFavicon, title: null };
  } finally {
    clearTimeout(timer);
  }
}
