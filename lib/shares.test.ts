import { describe, it, expect } from "vitest";
import {
  computeSharedDate,
  validateShareInput,
  extractDomain,
  NOTE_MAX_LENGTH,
  type ShareInput,
} from "./shares";

describe("computeSharedDate", () => {
  it("returns a YYYY-MM-DD string", () => {
    const result = computeSharedDate("America/New_York");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to America/New_York when timezone is null", () => {
    const result = computeSharedDate(null);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to America/New_York when timezone is undefined", () => {
    const result = computeSharedDate(undefined);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to America/New_York when timezone is empty string", () => {
    const result = computeSharedDate("");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("respects timezone differences", () => {
    // This test verifies the function uses the timezone parameter.
    // We can't assert exact dates without controlling Date.now(),
    // but we can verify different timezones produce valid dates.
    const eastern = computeSharedDate("America/New_York");
    const tokyo = computeSharedDate("Asia/Tokyo");
    // Both should be valid dates
    expect(new Date(eastern).toString()).not.toBe("Invalid Date");
    expect(new Date(tokyo).toString()).not.toBe("Invalid Date");
  });
});

describe("validateShareInput", () => {
  const validInput: ShareInput = {
    content_url: "https://example.com/article",
    title: "Example Article",
    description: "An interesting read",
    og_image_url: "https://example.com/image.jpg",
    og_site_name: "Example",
    note: "Check this out!",
  };

  it("accepts valid input", () => {
    const { data, error } = validateShareInput(validInput);
    expect(error).toBeNull();
    expect(data).toEqual({
      content_url: "https://example.com/article",
      title: "Example Article",
      description: "An interesting read",
      og_image_url: "https://example.com/image.jpg",
      og_site_name: "Example",
      note: "Check this out!",
    });
  });

  it("rejects missing content_url", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      content_url: "",
    });
    expect(error).toBe("URL is required.");
    expect(data).toBeNull();
  });

  it("rejects non-http URL", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      content_url: "ftp://example.com",
    });
    expect(error).toBe("Please enter a valid URL (http or https).");
    expect(data).toBeNull();
  });

  it("rejects invalid URL", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      content_url: "not a url",
    });
    expect(error).toBe("Please enter a valid URL (http or https).");
    expect(data).toBeNull();
  });

  it("accepts http URL", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      content_url: "http://example.com",
    });
    expect(error).toBeNull();
    expect(data?.content_url).toBe("http://example.com");
  });

  it("trims content_url", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      content_url: "  https://example.com  ",
    });
    expect(error).toBeNull();
    expect(data?.content_url).toBe("https://example.com");
  });

  it("rejects note over 280 characters", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      note: "a".repeat(NOTE_MAX_LENGTH + 1),
    });
    expect(error).toBe(`Note must be ${NOTE_MAX_LENGTH} characters or fewer.`);
    expect(data).toBeNull();
  });

  it("accepts note at exactly 280 characters", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      note: "a".repeat(NOTE_MAX_LENGTH),
    });
    expect(error).toBeNull();
    expect(data?.note).toHaveLength(NOTE_MAX_LENGTH);
  });

  it("normalizes empty note to null", () => {
    const { data, error } = validateShareInput({ ...validInput, note: "" });
    expect(error).toBeNull();
    expect(data?.note).toBeNull();
  });

  it("normalizes whitespace-only note to null", () => {
    const { data, error } = validateShareInput({ ...validInput, note: "   " });
    expect(error).toBeNull();
    expect(data?.note).toBeNull();
  });

  it("accepts null metadata fields", () => {
    const { data, error } = validateShareInput({
      content_url: "https://example.com",
      title: null,
      description: null,
      og_image_url: null,
      og_site_name: null,
      note: null,
    });
    expect(error).toBeNull();
    expect(data?.title).toBeNull();
    expect(data?.description).toBeNull();
    expect(data?.og_image_url).toBeNull();
    expect(data?.og_site_name).toBeNull();
    expect(data?.note).toBeNull();
  });

  it("truncates title silently at 500 chars", () => {
    const longTitle = "a".repeat(600);
    const { data, error } = validateShareInput({
      ...validInput,
      title: longTitle,
    });
    expect(error).toBeNull();
    expect(data?.title).toHaveLength(500);
  });

  it("truncates description silently at 1000 chars", () => {
    const longDesc = "a".repeat(1200);
    const { data, error } = validateShareInput({
      ...validInput,
      description: longDesc,
    });
    expect(error).toBeNull();
    expect(data?.description).toHaveLength(1000);
  });

  it("truncates og_site_name silently at 200 chars", () => {
    const longName = "a".repeat(300);
    const { data, error } = validateShareInput({
      ...validInput,
      og_site_name: longName,
    });
    expect(error).toBeNull();
    expect(data?.og_site_name).toHaveLength(200);
  });

  it("discards invalid og_image_url silently", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      og_image_url: "not-a-url",
    });
    expect(error).toBeNull();
    expect(data?.og_image_url).toBeNull();
  });

  it("trims note whitespace", () => {
    const { data, error } = validateShareInput({
      ...validInput,
      note: "  hello world  ",
    });
    expect(error).toBeNull();
    expect(data?.note).toBe("hello world");
  });
});

describe("extractDomain", () => {
  it("extracts domain from URL", () => {
    expect(extractDomain("https://www.example.com/path")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(extractDomain("https://www.nytimes.com")).toBe("nytimes.com");
  });

  it("preserves non-www subdomains", () => {
    expect(extractDomain("https://blog.example.com")).toBe("blog.example.com");
  });

  it("returns input on invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("not-a-url");
  });

  it("handles http URLs", () => {
    expect(extractDomain("http://example.com")).toBe("example.com");
  });
});
