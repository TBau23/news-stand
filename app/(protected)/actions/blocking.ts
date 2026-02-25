"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  validateBlockInput,
  validateUnblockInput,
  type BlockedUser,
} from "@/lib/blocking";
import { rateLimit } from "@/lib/rate-limit";

export async function blockUser(
  userId: string
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
    key: `blockUser:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!success) {
    return { error: "Too many requests. Please try again in a moment." };
  }

  const { error: validationError } = validateBlockInput(userId, user.id);
  if (validationError) {
    return { error: validationError };
  }

  const targetId = userId.trim();

  // Insert the block record
  const { error: blockError } = await supabase.from("blocks").insert({
    blocker_id: user.id,
    blocked_id: targetId,
  });

  if (blockError) {
    // 23505 = unique_violation — already blocked, treat as success
    if (blockError.code === "23505") {
      return undefined;
    }
    return { error: blockError.message };
  }

  // Remove follows in both directions
  await supabase
    .from("follows")
    .delete()
    .or(
      `and(follower_id.eq.${user.id},following_id.eq.${targetId}),and(follower_id.eq.${targetId},following_id.eq.${user.id})`
    );

  revalidatePath("/dashboard");
  return undefined;
}

export async function unblockUser(
  userId: string
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
    key: `unblockUser:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!success) {
    return { error: "Too many requests. Please try again in a moment." };
  }

  const { error: validationError } = validateUnblockInput(userId, user.id);
  if (validationError) {
    return { error: validationError };
  }

  const targetId = userId.trim();

  // Delete the block record — if no row deleted, still success (idempotent)
  await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId);

  return undefined;
}

export async function getBlockedUsers(): Promise<{
  data: BlockedUser[] | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, created_at, profiles!blocks_blocked_id_fkey(username, display_name, avatar_url)")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  const blockedUsers: BlockedUser[] = (data || []).map((row) => {
    const profile = row.profiles as unknown as {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    } | null;

    return {
      blocked_id: row.blocked_id,
      created_at: row.created_at,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });

  return { data: blockedUsers, error: null };
}
