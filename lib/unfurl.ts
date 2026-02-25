import { parse } from "node-html-parser";
import { assertPublicHost, SSRFError } from "./ssrf";

export interface UnfurlResult {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  url: string;
}

const MAX_BODY_BYTES = 50 * 1024; // 50KB
const FETCH_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_SITE_NAME_LENGTH = 200;
const MAX_IMAGE_URL_LENGTH = 2000;

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

export class UnfurlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnfurlValidationError";
  }
}

export class UnfurlFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnfurlFetchError";
  }
}

/** Strip HTML tags from a string. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

/** Truncate a string to a max length. */
function truncate(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

/** Validate and normalize a user-supplied URL. */
export function validateUrl(raw: string): URL {
  if (!raw || typeof raw !== "string") {
    throw new UnfurlValidationError("URL is required.");
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UnfurlValidationError("URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnfurlValidationError("Invalid URL format.");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new UnfurlValidationError(
      "Only http and https URLs are allowed."
    );
  }

  return parsed;
}

/** Extract OG metadata from an HTML string. */
export function extractMetadata(
  html: string,
  pageUrl: string
): Omit<UnfurlResult, "url"> {
  const root = parse(html);

  const getMeta = (property: string): string | null => {
    // Try og: property first
    const ogTag =
      root.querySelector(`meta[property="${property}"]`) ??
      root.querySelector(`meta[name="${property}"]`);
    const content = ogTag?.getAttribute("content");
    return content ? stripHtml(content) : null;
  };

  let title = getMeta("og:title");
  if (!title) {
    const titleTag = root.querySelector("title");
    title = titleTag ? stripHtml(titleTag.text) : null;
  }

  let description = getMeta("og:description");
  if (!description) {
    description = getMeta("description");
  }

  let imageUrl = getMeta("og:image");
  if (imageUrl) {
    // Discard data: URIs
    if (imageUrl.startsWith("data:")) {
      imageUrl = null;
    } else {
      // Resolve relative URLs
      try {
        imageUrl = new URL(imageUrl, pageUrl).href;
      } catch {
        imageUrl = null;
      }
    }
  }

  const siteName = getMeta("og:site_name");

  return {
    title: truncate(title, MAX_TITLE_LENGTH),
    description: truncate(description, MAX_DESCRIPTION_LENGTH),
    image_url: truncate(imageUrl, MAX_IMAGE_URL_LENGTH),
    site_name: truncate(siteName, MAX_SITE_NAME_LENGTH),
  };
}

/**
 * Fetch a URL with SSRF protection, redirect following, body size limits,
 * and timeout. Returns the response body as a string.
 */
export async function safeFetch(url: URL): Promise<{ body: string; finalUrl: string }> {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    await assertPublicHost(currentUrl.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(currentUrl.href, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "Memo/1.0 bot",
          Accept: "text/html",
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof SSRFError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new UnfurlFetchError("The page took too long to respond.");
      }
      throw new UnfurlFetchError("Could not fetch URL.");
    } finally {
      clearTimeout(timeout);
    }

    // Handle redirects manually to validate each hop
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UnfurlFetchError("Redirect without location header.");
      }
      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new UnfurlFetchError("Too many redirects.");
      }
      try {
        currentUrl = new URL(location, currentUrl.href);
      } catch {
        throw new UnfurlFetchError("Invalid redirect URL.");
      }
      if (!ALLOWED_SCHEMES.has(currentUrl.protocol)) {
        throw new UnfurlFetchError("Could not fetch URL.");
      }
      continue;
    }

    if (!response.ok) {
      throw new UnfurlFetchError("The page returned an error.");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new UnfurlFetchError("URL does not point to an HTML page.");
    }

    // Read limited body
    const reader = response.body?.getReader();
    if (!reader) {
      throw new UnfurlFetchError("Could not read response body.");
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (totalBytes < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.byteLength;
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const body = decoder.decode(
      concatUint8Arrays(chunks).slice(0, MAX_BODY_BYTES)
    );

    return { body, finalUrl: currentUrl.href };
  }

  throw new UnfurlFetchError("Too many redirects.");
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}

/** Top-level unfurl function: validate, fetch, parse. */
export async function unfurl(rawUrl: string): Promise<UnfurlResult> {
  const parsedUrl = validateUrl(rawUrl);
  const { body, finalUrl } = await safeFetch(parsedUrl);
  const metadata = extractMetadata(body, finalUrl);

  return {
    ...metadata,
    url: finalUrl,
  };
}
