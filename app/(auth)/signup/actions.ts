"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function signup(formData: FormData): Promise<{ error: string } | undefined> {
  // Rate limit: 5 req/15min per IP
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { success } = rateLimit({
    key: `signup:${ip}`,
    limit: 5,
    windowMs: 15 * 60_000,
  });

  if (!success) {
    return { error: "Too many signup attempts. Please try again later." };
  }

  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/onboarding");
}
