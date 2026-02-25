import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeSharedDate } from "@/lib/shares";
import ShareForm from "./share-form";

export default async function SharePage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const sharedDate = computeSharedDate(profile?.timezone);

  const { data: existingShare } = await supabase
    .from("shares")
    .select("id")
    .eq("user_id", user.id)
    .eq("shared_date", sharedDate)
    .maybeSingle();

  if (existingShare) {
    redirect("/share/today");
  }

  return <ShareForm />;
}
