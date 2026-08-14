import { redirect } from "next/navigation";

/** Old URL — keep a soft redirect for bookmarks. */
export default function GuertechRedirectPage() {
  redirect("/dispatch-v2");
}
