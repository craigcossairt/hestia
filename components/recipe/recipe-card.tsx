"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bookmark } from "lucide-react";
import { Card, FoodImage, H, Mono, Label } from "@/components/ds";
import { StarRating } from "./star-rating";
import { toggleSavedRecipe } from "@/app/(app)/recipes/actions";
import { cn } from "@/lib/utils";

interface RecipeCardProps {
  id: string;
  name: string;
  photoUrl: string | null;
  kcal: number | null;
  timeMin: number | null;
  rating?: number;
  saved?: boolean;
  tags?: string[];
}

export function RecipeCard({
  id,
  name,
  photoUrl,
  kcal,
  timeMin,
  rating = 0,
  saved = false,
  tags = [],
}: RecipeCardProps) {
  const [pending, start] = useTransition();
  return (
    <Card className="overflow-hidden flex flex-col group relative">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          start(() => toggleSavedRecipe(id));
        }}
        className={cn(
          "absolute top-2 right-2 z-10 p-2 rounded-full bg-card/80 backdrop-blur border border-ink-l/50 transition-colors",
          saved ? "text-accent" : "text-ink-3 hover:text-ink",
        )}
        aria-label={saved ? "remove bookmark" : "bookmark"}
      >
        <Bookmark size={16} strokeWidth={1.5} fill={saved ? "currentColor" : "transparent"} />
      </button>
      <Link href={`/recipes/${id}`} className="flex flex-col">
        <FoodImage name={name} src={photoUrl ?? undefined} height={160} rounded={false} showLabel={false} />
        <div className="p-4 flex flex-col gap-2">
          <H size="sm">{name}</H>
          <Mono className="text-ink-3 text-[12px]">
            {timeMin ? `${timeMin} min` : "—"}
            {kcal != null ? ` · ${kcal} kcal` : ""}
          </Mono>
          <div className="flex justify-between items-center mt-1">
            <StarRating recipeId={id} initialRating={rating} size={14} />
            {tags[0] ? <Label>{tags[0]}</Label> : null}
          </div>
        </div>
      </Link>
    </Card>
  );
}
