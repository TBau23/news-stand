import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps): Promise<React.ReactNode> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has completed onboarding (username is set).
  // Skip the check if we're already on the onboarding page.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const isOnboarding = pathname === "/onboarding";

  if (!isOnboarding) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    if (!profile?.username) {
      redirect("/onboarding");
    }
  }

  return children;
}
