import { redirect } from "next/navigation";

/** Subscriptions now live inside the Cards screen. */
export default function SubscriptionsRedirect() {
  redirect("/cards?tab=subscriptions");
}
