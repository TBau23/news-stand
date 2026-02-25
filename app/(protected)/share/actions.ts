"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  validateShareInput,
  computeSharedDate,
  type ShareInput,
} from "@/lib/shares";
import { rateLimit } from "@/lib/rate-limit";

export async function createShare(
  formData: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Rate limit: 10 req/min per user
  const { success } = rateLimit({
    key: `createShare:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!success) {
    return { error: "Too many requests. Please try again in a moment." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const sharedDate = computeSharedDate(profile?.timezone);

  const input: ShareInput = {
    content_url: formData.get("content_url") as string,
    title: (formData.get("title") as string) || null,
    description: (formData.get("description") as string) || null,
    og_image_url: (formData.get("og_image_url") as string) || null,
    og_site_name: (formData.get("og_site_name") as string) || null,
    note: (formData.get("note") as string) || null,
  };

  const { data: validated, error: validationError } =
    validateShareInput(input);
  if (validationError || !validated) {
    return { error: validationError || "Invalid input." };
  }

  const { error: insertError } = await supabase.from("shares").insert({
    user_id: user.id,
    content_url: validated.content_url,
    title: validated.title,
    description: validated.description,
    og_image_url: validated.og_image_url,
    og_site_name: validated.og_site_name,
    note: validated.note,
    shared_date: sharedDate,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: "You've already shared today." };
    }
    return { error: insertError.message };
  }

  redirect("/share/today");
}
