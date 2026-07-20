"use client";

import { useEffect, useState, type ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveals text word-by-word: each word rises + fades in with a staggered delay.
 * Mirrors the reference hero's headline/sub-line entrance.
 */
export function WordReveal({
  text,
  as: Tag = "span",
  className,
  wordClassName,
  baseDelay = 0,
  stagger = 85,
  duration = 720,
  fromY = 26,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  wordClassName?: string;
  baseDelay?: number;
  stagger?: number;
  duration?: number;
  fromY?: number;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const words = text.split(" ");
  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block">
          <span
            className={cn("inline-block will-change-transform", wordClassName)}
            style={{
              transition: `transform ${duration}ms cubic-bezier(0.16,1,0.3,1), opacity ${duration}ms ease`,
              transitionDelay: `${baseDelay + i * stagger}ms`,
              transform: shown ? "translateY(0)" : `translateY(${fromY}px)`,
              opacity: shown ? 1 : 0,
            }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
