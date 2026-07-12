import { redirect } from "next/navigation";

/** The activity feed now lives inside the Settings screen. */
export default function ActivityRedirect() {
  redirect("/settings?tab=activity");
}
