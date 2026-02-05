import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import type { Database } from "@/lib/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm p-8">
        <h1 className="mb-8 text-2xl font-semibold text-center text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <div className="space-y-4 mb-8">
          <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Email</p>
            <p className="text-zinc-900 dark:text-zinc-50">{user?.email}</p>
          </div>
          <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Profile ID</p>
            <p className="text-zinc-900 dark:text-zinc-50 font-mono text-sm break-all">
              {profile?.id}
            </p>
          </div>
          {profile?.username && (
            <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Username</p>
              <p className="text-zinc-900 dark:text-zinc-50">@{profile.username}</p>
            </div>
          )}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-50 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
