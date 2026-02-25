import { describe, it, expect } from "vitest";
import { validateUrl, extractMetadata, UnfurlValidationError } from "./unfurl";

describe("validateUrl", () => {
  it("parses a valid https URL", () => {
    const url = validateUrl("https://example.com/article");
    expect(url.href).toBe("https://example.com/article");
  });

  it("parses a valid http URL", () => {
    const url = validateUrl("http://example.com");
    expect(url.href).toBe("http://example.com/");
  });

  it("trims whitespace", () => {
    const url = validateUrl("  https://example.com  ");
    expect(url.href).toBe("https://example.com/");
  });

  it("throws for empty string", () => {
    expect(() => validateUrl("")).toThrow(UnfurlValidationError);
    expect(() => validateUrl("")).toThrow("URL is required.");
  });

  it("throws for non-string input", () => {
    expect(() => validateUrl(null as unknown as string)).toThrow(
      UnfurlValidationError
    );
  });

  it("throws for invalid URL format", () => {
    expect(() => validateUrl("not-a-url")).toThrow(UnfurlValidationError);
    expect(() => validateUrl("not-a-url")).toThrow("Invalid URL format.");
  });

  it("rejects file:// scheme", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(
      UnfurlValidationError
    );
    expect(() => validateUrl("file:///etc/passwd")).toThrow(
      "Only http and https URLs are allowed."
    );
  });

  it("rejects javascript: scheme", () => {
    expect(() => validateUrl("javascript:alert(1)")).toThrow(
      UnfurlValidationError
    );
  });

  it("rejects data: scheme", () => {
    expect(() => validateUrl("data:text/html,<h1>hi</h1>")).toThrow(
      UnfurlValidationError
    );
  });

  it("rejects ftp: scheme", () => {
    expect(() => validateUrl("ftp://files.example.com")).toThrow(
      UnfurlValidationError
    );
  });
});

describe("extractMetadata", () => {
  const pageUrl = "https://example.com/article";

  it("extracts OG metadata", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="My Article" />
          <meta property="og:description" content="A great article about testing" />
          <meta property="og:image" content="https://example.com/image.jpg" />
          <meta property="og:site_name" content="Example" />
          <title>Fallback Title</title>
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadata(html, pageUrl);
    expect(result.title).toBe("My Article");
    expect(result.description).toBe("A great article about testing");
    expect(result.image_url).toBe("https://example.com/image.jpg");
    expect(result.site_name).toBe("Example");
  });

  it("falls back to <title> when og:title is missing", () => {
    const html = `
      <html>
        <head>
          <title>Page Title</title>
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadata(html, pageUrl);
    expect(result.title).toBe("Page Title");
  });

  it("falls back to meta[name=description] when og:description is missing", () => {
    const html = `
      <html>
        <head>
          <meta name="description" content="Meta description fallback" />
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadata(html, pageUrl);
    expect(result.description).toBe("Meta description fallback");
  });

  it("returns nulls when no metadata is found", () => {
    const html = `<html><head></head><body>Hello</body></html>`;

    const result = extractMetadata(html, pageUrl);
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.image_url).toBeNull();
    expect(result.site_name).toBeNull();
  });

  it("resolves relative og:image URLs", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/images/thumb.jpg" />
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadata(html, pageUrl);
    expect(result.image_url).toBe("https://example.com/images/thumb.jpg");
  });

  it("discards data: URI og:image", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="data:image/png;base64,abc123" />
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadata(html, pageUrl);
    expect(result.image_url).toBeNull();
  });

  it("strips HTML tags from metadata values", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Title with <b>bold</b> text" />
          <meta property="og:description" content="Desc with <script>alert(1)</script> injection" />
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadata(html, pageUrl);
    expect(result.title).toBe("Title with bold text");
    expect(result.description).toBe("Desc with alert(1) injection");
  });

  it("truncates fields that exceed max length", () => {
    const longTitle = "A".repeat(600);
    const html = `
      <html>
        <head>
          <meta property="og:title" content="${longTitle}" />
        </head>
        <body></body>
      </html>
    `;

    const result = extractMetadata(html, pageUrl);
    expect(result.title).toHaveLength(500);
  });

  it("handles malformed HTML gracefully", () => {
    const html = `<head><meta property="og:title" content="Works">`;

    const result = extractMetadata(html, pageUrl);
    expect(result.title).toBe("Works");
  });
});
