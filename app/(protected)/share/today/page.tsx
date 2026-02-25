import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeSharedDate } from "@/lib/shares";
import TodaysShareView from "./todays-share-view";

export default async function TodaysSharePage(): Promise<React.JSX.Element> {
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

  const { data: share } = await supabase
    .from("shares")
    .select("*")
    .eq("user_id", user.id)
    .eq("shared_date", sharedDate)
    .maybeSingle();

  if (!share) {
    redirect("/share");
  }

  return <TodaysShareView share={share} />;
}
