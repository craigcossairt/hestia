"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddRecipeModal } from "./add-recipe-modal";

export function AddRecipeFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 md:bottom-8 right-6 md:right-12 z-30 flex items-center gap-2 px-5 py-3 rounded-full bg-ink text-paper shadow-[var(--shadow-2)] hover:opacity-90 transition-opacity font-sans text-[14px] font-medium"
        aria-label="Add recipe"
      >
        <Plus size={16} strokeWidth={2} />
        Add recipe
      </button>
      <AddRecipeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
