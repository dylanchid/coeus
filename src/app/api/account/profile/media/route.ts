import { handleUploadProfileMedia } from "@/lib/profileMediaApi";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import {
  authenticateArchiveRequest,
  createAdminSupabaseClient,
  createRequestSupabaseClient,
} from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // Write via the caller's own session so the storage.objects "<uid>/" policy
  // applies (defense-in-depth alongside the route's own MIME/size/magic checks).
  const session = await createRequestSupabaseClient();
  const bucket = session.storage.from("profile-media");

  return handleUploadProfileMedia(request, {
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
  });
}
