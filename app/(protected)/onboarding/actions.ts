"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function completeOnboarding(
  formData: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Rate limit: 5 req/min per user
  const { success } = rateLimit({
    key: `completeOnboarding:${user.id}`,
    limit: 5,
    windowMs: 60_000,
  });

  if (!success) {
    return { error: "Too many requests. Please try again in a moment." };
  }

  const username = (formData.get("username") as string).trim().toLowerCase();
  const displayName = (formData.get("display_name") as string).trim();
  const timezone = formData.get("timezone") as string;

  if (!username || username.length < 3) {
    return { error: "Username must be at least 3 characters." };
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return { error: "Username can only contain lowercase letters, numbers, and underscores." };
  }

  if (!displayName) {
    return { error: "Display name is required." };
  }

  if (!timezone) {
    return { error: "Please select a timezone." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      display_name: displayName,
      timezone,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That username is already taken." };
    }
    return { error: error.message };
  }

  redirect("/dashboard");
}
