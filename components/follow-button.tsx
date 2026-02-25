"use client";

import { useState, useTransition } from "react";
import { followUser, unfollowUser } from "@/app/(protected)/actions/social";
import type { BlockStatus } from "@/lib/social";

export interface FollowButtonProps {
  userId: string;
  initialIsFollowing: boolean;
  blockStatus: BlockStatus;
  isOwnProfile: boolean;
}

export default function FollowButton({
  userId,
  initialIsFollowing,
  blockStatus,
  isOwnProfile,
}: FollowButtonProps): React.JSX.Element | null {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, startTransition] = useTransition();
  const [isHovered, setIsHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Don't render on own profile
  if (isOwnProfile) {
    return null;
  }

  // Viewer blocked this user — show "Blocked" label
  if (blockStatus === "viewer_blocked") {
    return (
      <span className="inline-block px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Blocked
      </span>
    );
  }

  // This user blocked the viewer — show disabled button
  if (blockStatus === "blocked_by") {
    return (
      <div className="text-center">
        <button
          disabled
          className="px-4 py-2 text-sm font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
        >
          Follow
        </button>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Unable to follow this user.
        </p>
      </div>
    );
  }

  const handleClick = () => {
    setError(null);
    const previousState = isFollowing;

    // Optimistic update
    setIsFollowing(!isFollowing);

    startTransition(async () => {
      const result = isFollowing
        ? await unfollowUser(userId)
        : await followUser(userId);

      if ("error" in result) {
        // Revert optimistic update
        setIsFollowing(previousState);
        setError("Something went wrong. Try again.");
        // Clear error after 3 seconds
        setTimeout(() => setError(null), 3000);
      }
    });
  };

  // Determine button appearance based on state
  const showUnfollow = isFollowing && isHovered && !isPending;
  const label = isPending
    ? isFollowing
      ? "Following"
      : "Follow"
    : isFollowing
      ? showUnfollow
        ? "Unfollow"
        : "Following"
      : "Follow";

  const baseClasses =
    "px-4 py-2 text-sm font-medium rounded-full transition-colors min-w-[100px]";

  const stateClasses = isFollowing
    ? showUnfollow
      ? "border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-transparent hover:bg-red-50 dark:hover:bg-red-950"
      : "border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 bg-transparent"
    : "bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200";

  const disabledClasses = isPending ? "opacity-60 cursor-not-allowed" : "";

  return (
    <div className="text-center">
      <button
        onClick={handleClick}
        disabled={isPending}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`${baseClasses} ${stateClasses} ${disabledClasses}`}
      >
        {label}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
