// Recipe import from a photo (cookbook page, magazine clipping,
// restaurant menu, screenshot). Vision model + the photo-specific
// prompt that already lives in lib/ai/prompts/recipe.ts.
//
// Was previously hardcoded to xAI; switched to the pluggable provider
// abstraction so OpenAI / Anthropic / Google all work via the same
// route. Also runs the resolved photo chain so a user-uploaded
// cookbook page still yields a recipe-card photo (Pexels / Brave /
// AI gen) without forcing the user to capture the dish itself.

import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import {
  getModel,
  getModelOpts,
  getProviderOptions,
} from "@/lib/ai/provider";
import { resolveRecipePhoto } from "@/lib/ai/photo";
import {
  RecipeSchema,
  parseRecipeFromPhotoPrompt,
} from "@/lib/ai/prompts/recipe";

export const maxDuration = 60;

const Body = z.object({
  // data URL like "data:image/jpeg;base64,...."
  image_data_url: z.string().startsWith("data:"),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    // Sanity cap matches the recipe-photos upload path. Base64 is
    // ~4/3 the binary size, so 11MB encoded ~= 8MB decoded.
    if (parsed.data.image_data_url.length > 11_500_000) {
      return NextResponse.json(
        { error: "Image too large (8MB max)." },
        { status: 413 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const quota = await checkAiQuota(supabase, user.id);
    if (!quota.ok && quota.response) return quota.response;

    let object;
    try {
      const result = await generateObject({
        model: getModel("vision"),
        schema: RecipeSchema,
        // Search would re-fetch any URLs the AI sees in the image. For
        // a cookbook page that's pointless — disable so we don't burn
        // search budget or surface opaque "Gone" errors from blocked
        // crawls.
        providerOptions: getProviderOptions({ disableSearch: true }),
        ...getModelOpts(),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: parseRecipeFromPhotoPrompt() },
              { type: "image", image: parsed.data.image_data_url },
            ],
          },
        ],
      });
      object = result.object;
    } catch (err) {
      const e = err as Error;
      console.error("recipe-photo failed", {
        name: e.name,
        message: e.message,
      });
      const lower = (e.message || "").toLowerCase();
      const friendly =
        lower.includes("zod") || lower.includes("schema")
          ? "Hestia couldn't read this image as a recipe. Try a clearer photo with the full ingredients + steps visible."
          : lower.includes("timeout")
            ? "The model took too long. Try a smaller image."
            : lower.includes("rate") || lower.includes("429")
              ? "The model is rate-limited right now. Try again in a minute."
              : `Couldn't read the photo: ${e.message || "unknown error"}.`;
      return NextResponse.json({ error: friendly }, { status: 500 });
    }

    // Standard photo-resolution chain. Vision-parsed recipes don't
    // have a source URL, but the AI may still surface an image_url
    // (rare) and the chain has Pexels / Brave / AI image generation
    // as fallbacks so the recipe card has a usable photo. supabase + user
    // passed so the ai-gen fallback can upload to Storage rather than
    // returning a data: URI.
    const photo = await resolveRecipePhoto({
      recipeName: object.name,
      sourceUrl: null,
      aiImageUrl: object.image_url ?? null,
      promptHint: object.tags?.slice(0, 3).join(", "),
      supabase,
      userId: user.id,
    });

    return NextResponse.json({
      ...object,
      source_url: null,
      source_image_url: null,
      photo_url: photo?.url ?? null,
      photo_source: photo?.source ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${(err as Error).message ?? "unknown"}` },
      { status: 500 },
    );
  }
}
