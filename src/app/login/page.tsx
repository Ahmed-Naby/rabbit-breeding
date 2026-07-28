import { redirect } from "next/navigation";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getWebSession } from "@/lib/web-session";
import { LoginForm } from "./login-form";

/**
 * The one page the proxy lets through unauthenticated. Rendered without the
 * app shell — see the root layout, which only mounts the nav once there is a
 * session (a sidebar full of links to pages that would all redirect back here
 * is worse than no sidebar).
 */
export default async function LoginPage() {
  // Already signed in: nothing to do here, and leaving the form reachable
  // invites a second token per visit.
  if (await getWebSession()) redirect("/");
  const { t } = await getDictionary();
  return <LoginForm t={t.auth} />;
}
