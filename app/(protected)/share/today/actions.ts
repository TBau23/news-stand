"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateNoteUpdate } from "@/lib/shares";
import { rateLimit } from "@/lib/rate-limit";

export async function updateShareNote(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  // Rate limit: 20 req/min per user
  const { success } = rateLimit({
    key: `updateShareNote:${user.id}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (!success) {
    return { error: "Too many requests. Please try again in a moment." };
  }

  const input = {
    share_id: formData.get("share_id") as string,
    note: (formData.get("note") as string) || null,
  };

  const { data: validated, error: validationError } =
    validateNoteUpdate(input);
  if (validationError || !validated) {
    return { error: validationError || "Invalid input." };
  }

  // Verify ownership
  const { data: share, error: fetchError } = await supabase
    .from("shares")
    .select("user_id")
    .eq("id", validated.share_id)
    .single();

  if (fetchError || !share) {
    return { error: "Share not found." };
  }

  if (share.user_id !== user.id) {
    return { error: "Not authorized." };
  }

  const { error: updateError } = await supabase
    .from("shares")
    .update({ note: validated.note, updated_at: new Date().toISOString() })
    .eq("id", validated.share_id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/share/today");
  return { success: true };
}
