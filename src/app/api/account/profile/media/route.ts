import { handleUploadProfileMedia } from "@/lib/profileMediaApi";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // The client write policies on profile-media were dropped (F-24): this bucket
  // is BFF-only. handleUploadProfileMedia authenticates the caller and forces
  // the object path to `<uid>/…`, so the admin client is safe here — ownership
  // is enforced by the route, not by an RLS "<uid>/" policy.
  const admin = createAdminSupabaseClient();
  const bucket = admin.storage.from("profile-media");

  return instrument(
    { route: "account.profile.media", operation: "handleUploadProfileMedia", correlationId: requestCorrelationId(request) },
    () => handleUploadProfileMedia(request, {
    authenticate: authenticateArchiveRequest,
    storage: {
      async upload(path, body, contentType) {
        const { error } = await bucket.upload(path, body, { contentType, upsert: true });
        if (error) throw error;
      },
      async remove(paths) {
        await bucket.remove(paths);
      },
      publicUrl(path) {
        return bucket.getPublicUrl(path).data.publicUrl;
      },
    },
    async currentMedia(userId) {
      const profile = await new SupabaseProfileStore(createAdminSupabaseClient()).get(userId);
      return profile ? { avatarUrl: profile.avatarUrl, coverUrl: profile.coverUrl } : null;
    },
    }),
  );
}
