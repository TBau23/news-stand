import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const buttonClassName =
  "px-6 py-3 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors";

export default async function Home(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const linkHref = user ? "/dashboard" : "/login";
  const linkText = user ? "Go to Dashboard" : "Sign In";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-col items-center gap-8 p-8">
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
          Dossier
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 text-center max-w-md">
          Share one piece of content per day with the people who matter.
        </p>
        <div className="flex gap-4">
          <Link href={linkHref} className={buttonClassName}>
            {linkText}
          </Link>
        </div>
      </main>
    </div>
  );
}
