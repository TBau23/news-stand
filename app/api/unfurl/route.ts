import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  unfurl,
  UnfurlValidationError,
  UnfurlFetchError,
} from "@/lib/unfurl";
import { SSRFError } from "@/lib/ssrf";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request): Promise<NextResponse> {
  // Authenticate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 30 req/min per user
  const { success, resetAt } = rateLimit({
    key: `unfurl:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (resetAt.getTime() - Date.now()) / 1000
          ).toString(),
        },
      }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const url =
    typeof body === "object" && body !== null && "url" in body
      ? (body as { url: unknown }).url
      : undefined;

  if (typeof url !== "string") {
    return NextResponse.json(
      { error: "URL is required." },
      { status: 400 }
    );
  }

  try {
    const result = await unfurl(url);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnfurlValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof SSRFError) {
      return NextResponse.json(
        { error: "Could not fetch URL." },
        { status: 422 }
      );
    }
    if (err instanceof UnfurlFetchError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("Unexpected unfurl error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
