import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);

  // Rate limit: 10 req/min per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = rateLimit({
    key: `authCallback:${ip}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!success) {
    return NextResponse.redirect(`${origin}/login?error=Too many requests`);
  }

  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=Could not authenticate`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=Could not authenticate`);
  }

  const next = searchParams.get("next") ?? "/dashboard";
  return NextResponse.redirect(`${origin}${next}`);
}
