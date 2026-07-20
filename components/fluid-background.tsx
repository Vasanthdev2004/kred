"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Mounts the WebGL fluid-ink simulation on a full-bleed canvas behind hero content.
 * Falls back to a static emerald gradient when the user prefers reduced motion or
 * WebGL is unavailable, so the hero always looks intentional.
 */
export function FluidBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      setFailed(true);
      return;
    }
    let destroy: (() => void) | undefined;
    let cancelled = false;
    import("@/lib/fluid")
      .then(({ fluidSimulation }) => {
        if (cancelled || !canvasRef.current) return;
        try {
          destroy = fluidSimulation(canvasRef.current);
        } catch (err) {
          console.warn("Fluid sim unavailable, using fallback.", err);
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return (
    <div className={cn("overflow-hidden bg-[#06090c]", className)} aria-hidden>
      {failed ? (
        <div className="absolute inset-0 bg-[radial-gradient(55%_55%_at_50%_18%,#0d4a3c_0%,transparent_70%),radial-gradient(45%_50%_at_82%_65%,#0a3542_0%,transparent_70%),radial-gradient(40%_40%_at_20%_75%,#0b3a2e_0%,transparent_70%)]" />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      )}
    </div>
  );
}
