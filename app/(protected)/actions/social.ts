"use server";

import { createClient } from "@/lib/supabase/server";
import {
  validateFollowInput,
  validateUnfollowInput,
  type FollowResult,
  type UnfollowResult,
  type BlockStatus,
} from "@/lib/social";
import { rateLimit } from "@/lib/rate-limit";

export async function followUser(userId: string): Promise<FollowResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "not_authenticated" };
  }

  // Rate limit: 20 req/min per user
  const { success: withinLimit } = rateLimit({
    key: `followUser:${user.id}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (!withinLimit) {
    return { error: "rate_limited" };
  }

  const { error: validationError } = validateFollowInput(userId, user.id);
  if (validationError) {
    return { error: "invalid_user" };
  }

  const targetId = userId.trim();

  const { error: insertError } = await supabase.from("follows").insert({
    follower_id: user.id,
    following_id: targetId,
  });

  if (insertError) {
    // 23505 = unique_violation — already following, treat as success
    if (insertError.code === "23505") {
      return { success: true };
    }
    // RLS failure or block check failure
    return { error: "unable_to_follow" };
  }

  return { success: true };
}

export async function unfollowUser(userId: string): Promise<UnfollowResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "not_authenticated" };
  }

  // Rate limit: 20 req/min per user
  const { success: withinLimit } = rateLimit({
    key: `unfollowUser:${user.id}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (!withinLimit) {
    return { error: "rate_limited" };
  }

  const { error: validationError } = validateUnfollowInput(userId, user.id);
  if (validationError) {
    return { error: "not_authenticated" };
  }

  const targetId = userId.trim();

  // Delete the follow — if no row deleted, still success (idempotent)
  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", targetId);

  return { success: true };
}

export async function getFollowStatus(
  userId: string
): Promise<{ isFollowing: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isFollowing: false };
  }

  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", userId.trim())
    .limit(1)
    .maybeSingle();

  return { isFollowing: !!data };
}

export async function getBlockStatus(
  userId: string
): Promise<{ blockStatus: BlockStatus }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { blockStatus: "none" };
  }

  const targetId = userId.trim();

  // Check if viewer blocked the target
  const { data: viewerBlocked } = await supabase
    .from("blocks")
    .select("blocker_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", targetId)
    .limit(1)
    .maybeSingle();

  if (viewerBlocked) {
    return { blockStatus: "viewer_blocked" };
  }

  // Check if target blocked the viewer
  const { data: blockedBy } = await supabase
    .from("blocks")
    .select("blocker_id")
    .eq("blocker_id", targetId)
    .eq("blocked_id", user.id)
    .limit(1)
    .maybeSingle();

  if (blockedBy) {
    return { blockStatus: "blocked_by" };
  }

  return { blockStatus: "none" };
}
