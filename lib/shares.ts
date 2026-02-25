const DEFAULT_TIMEZONE = "America/New_York";
const NOTE_MAX_LENGTH = 280;
const TITLE_MAX_LENGTH = 500;
const DESCRIPTION_MAX_LENGTH = 1000;
const SITE_NAME_MAX_LENGTH = 200;

export { NOTE_MAX_LENGTH };

export interface ShareInput {
  content_url: string;
  title: string | null;
  description: string | null;
  og_image_url: string | null;
  og_site_name: string | null;
  note: string | null;
}

export interface ValidatedShareInput {
  content_url: string;
  title: string | null;
  description: string | null;
  og_image_url: string | null;
  og_site_name: string | null;
  note: string | null;
}

export function computeSharedDate(timezone: string | null | undefined): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeEmpty(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return value.trim();
}

export function validateShareInput(input: ShareInput): {
  data: ValidatedShareInput | null;
  error: string | null;
} {
  const contentUrl = input.content_url?.trim();
  if (!contentUrl) {
    return { data: null, error: "URL is required." };
  }
  if (!isValidHttpUrl(contentUrl)) {
    return { data: null, error: "Please enter a valid URL (http or https)." };
  }

  const note = normalizeEmpty(input.note);
  if (note && note.length > NOTE_MAX_LENGTH) {
    return {
      data: null,
      error: `Note must be ${NOTE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const ogImageUrl = normalizeEmpty(input.og_image_url);
  if (ogImageUrl && !isValidHttpUrl(ogImageUrl)) {
    // Silently discard invalid OG image URL rather than blocking the share
    return {
      data: {
        content_url: contentUrl,
        title: truncate(normalizeEmpty(input.title), TITLE_MAX_LENGTH),
        description: truncate(
          normalizeEmpty(input.description),
          DESCRIPTION_MAX_LENGTH
        ),
        og_image_url: null,
        og_site_name: truncate(
          normalizeEmpty(input.og_site_name),
          SITE_NAME_MAX_LENGTH
        ),
        note,
      },
      error: null,
    };
  }

  return {
    data: {
      content_url: contentUrl,
      title: truncate(normalizeEmpty(input.title), TITLE_MAX_LENGTH),
      description: truncate(
        normalizeEmpty(input.description),
        DESCRIPTION_MAX_LENGTH
      ),
      og_image_url: ogImageUrl,
      og_site_name: truncate(
        normalizeEmpty(input.og_site_name),
        SITE_NAME_MAX_LENGTH
      ),
      note,
    },
    error: null,
  };
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
