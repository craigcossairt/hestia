import { cn } from "@/lib/utils";

interface FoodImageProps {
  name?: string;
  src?: string;
  height?: number;
  className?: string;
  rounded?: boolean;
  showLabel?: boolean;
  alt?: string;
}

function hueFromName(name: string): number {
  return [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 60 + 20;
}

export function FoodImage({
  name,
  src,
  height = 120,
  className,
  rounded = true,
  showLabel = true,
  alt,
}: FoodImageProps) {
  if (src) {
    return (
      <div
        style={{ height }}
        className={cn(
          "w-full overflow-hidden relative bg-paper-2",
          rounded && "rounded-thumb",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? name ?? ""}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  const hue = name ? hueFromName(name) : 30;
  const bg = `linear-gradient(135deg, oklch(0.85 0.07 ${hue}) 0%, oklch(0.75 0.09 ${hue + 20}) 100%)`;
  const tex = `radial-gradient(circle at 20% 30%, oklch(0.95 0.05 ${hue + 30}) 0%, transparent 40%)`;
  return (
    <div
      style={{ height, background: bg }}
      className={cn(
        "w-full overflow-hidden relative flex items-end",
        rounded && "rounded-thumb",
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-50"
        style={{ backgroundImage: tex }}
      />
      {showLabel && name && (
        <div className="relative px-2.5 py-2 font-sans font-medium text-[11px] text-black/70 lowercase">
          {name}
        </div>
      )}
    </div>
  );
}
