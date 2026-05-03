"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { rateRecipe } from "@/app/(app)/recipes/actions";

interface StarRatingProps {
  recipeId: string;
  initialRating?: number;
  size?: number;
  readOnly?: boolean;
}

export function StarRating({
  recipeId,
  initialRating = 0,
  size = 18,
  readOnly = false,
}: StarRatingProps) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const [pending, start] = useTransition();
  const display = hover || rating;

  return (
    <div className="flex gap-0.5" aria-label="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly || pending}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => {
            if (readOnly) return;
            setRating(n);
            start(async () => {
              await rateRecipe(recipeId, n);
            });
          }}
          className={cn(
            "transition-colors",
            !readOnly && "cursor-pointer",
            display >= n ? "text-accent" : "text-ink-l",
          )}
        >
          <Star
            size={size}
            strokeWidth={1.5}
            fill={display >= n ? "currentColor" : "transparent"}
          />
        </button>
      ))}
    </div>
  );
}
