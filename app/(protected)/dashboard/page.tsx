import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeSharedDate } from "@/lib/shares";
import { getFeedShares } from "@/lib/feed";
import { getEmptyStateType, getShareLink } from "@/lib/dashboard";
import { getInitial, getAvatarColor } from "@/lib/share-card";
import ShareCard from "@/components/share-card";
import { signOut } from "./actions";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, timezone, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile?.username) {
    redirect("/onboarding");
  }

  const sharedDate = computeSharedDate(profile.timezone);

  // Fetch all three data points in parallel
  const [shareResult, todayShareResult, followCountResult] = await Promise.all([
    getFeedShares(supabase, user.id),
    supabase
      .from("shares")
      .select("id")
      .eq("user_id", user.id)
      .eq("shared_date", sharedDate)
      .maybeSingle(),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id),
  ]);

  const hasSharedToday = !!todayShareResult.data;
  const followCount = followCountResult.count ?? 0;
  const shareLink = getShareLink(hasSharedToday);

  // Handle feed query error
  if (shareResult.error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <Header
          profile={profile}
          shareLink={shareLink}
          hasSharedToday={hasSharedToday}
        />
        <main className="mx-auto max-w-5xl px-4 py-12">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Something went wrong loading your feed.
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              <a
                href="/dashboard"
                className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Try refreshing.
              </a>
            </p>
          </div>
        </main>
      </div>
    );
  }

  const feedShares = shareResult.data ?? [];
  const emptyState = getEmptyStateType(
    followCount,
    hasSharedToday,
    feedShares.length
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Header
        profile={profile}
        shareLink={shareLink}
        hasSharedToday={hasSharedToday}
      />

      {/* Share Status Banner */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-4 py-3">
          {hasSharedToday ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You shared today.{" "}
              <Link
                href="/share/today"
                className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                View your share
              </Link>
            </p>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              You haven&apos;t shared yet today.{" "}
              <Link
                href="/share"
                className="font-medium underline hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Share something
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Feed Grid or Empty State */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {emptyState === "welcome" && <WelcomeEmptyState />}
        {emptyState === "no-follows" && <NoFollowsEmptyState />}
        {emptyState === "no-shares-today" && <NoSharesTodayEmptyState />}
        {emptyState === null && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {feedShares.map((share) => (
              <ShareCard
                key={share.id}
                share={{
                  id: share.id,
                  content_url: share.content_url,
                  title: share.title,
                  description: share.description,
                  og_image_url: share.og_image_url,
                  og_site_name: share.og_site_name,
                  note: share.note,
                  created_at: share.created_at,
                }}
                sharer={{
                  username: share.username,
                  display_name: share.display_name,
                  avatar_url: share.avatar_url,
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Header({
  profile,
  shareLink,
  hasSharedToday,
}: {
  profile: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  shareLink: string;
  hasSharedToday: boolean;
}) {
  const username = profile.username ?? "";
  const initial = getInitial(profile.display_name, username);
  const avatarColor = getAvatarColor(username);

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Dossier
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={shareLink}
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {hasSharedToday ? "Your share" : "Share"}
          </Link>
          <div className="relative group">
            <button
              type="button"
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${avatarColor}`}
            >
              {initial}
            </button>
            {/* Dropdown menu */}
            <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function WelcomeEmptyState() {
  return (
    <div className="text-center py-16">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Welcome to Dossier
      </h2>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
        Share one thing today — your best find, your favorite read, the thing
        you&apos;d tell a friend about.
      </p>
      <Link
        href="/share"
        className="mt-6 inline-block px-6 py-3 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
      >
        Share something
      </Link>
      <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-500">
        Once you follow people, their daily picks will appear here.
      </p>
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        Invite and follow features are coming soon.
      </p>
    </div>
  );
}

function NoFollowsEmptyState() {
  return (
    <div className="text-center py-16">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Your shelf is empty
      </h2>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
        Follow people to see what they&apos;re reading and watching today.
      </p>
      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        Invite and follow features are coming soon.
      </p>
    </div>
  );
}

function NoSharesTodayEmptyState() {
  return (
    <div className="text-center py-16">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Nothing here yet today
      </h2>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
        The people you follow haven&apos;t shared anything yet. Check back
        later — the shelf fills up as the day goes on.
      </p>
    </div>
  );
}
