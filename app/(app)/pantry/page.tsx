import { redirect } from "next/navigation";

// Legacy redirect — the section was renamed to /inventory. Kept so any
// in-flight links or bookmarks land in the right place.
export default async function LegacyPantryRedirect() {
  redirect("/inventory");
}
