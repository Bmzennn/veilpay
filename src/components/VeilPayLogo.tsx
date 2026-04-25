"use client";

interface VeilPayLogoProps {
  /** Visual size of the logo container */
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  xs: "w-7 h-7 rounded-lg",
  sm: "w-8 h-8 rounded-xl",
  md: "w-10 h-10 rounded-xl",
  lg: "w-12 h-12 rounded-2xl",
};

/**
 * VeilPay brand logo — VP shield mark.
 * The PNG has a built-in black background that blends with the rounded container.
 */
export function VeilPayLogo({ size = "sm", className = "" }: VeilPayLogoProps) {
  return (
    <div className={`${SIZE[size]} bg-black overflow-hidden shrink-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-nobg.png"
        alt="VeilPay"
        className="w-full h-full object-contain"
        draggable={false}
      />
    </div>
  );
}
