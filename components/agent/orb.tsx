"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

/**
 * The assistant's face.
 *
 * Four states, each readable at a glance without a caption, because the orb is often
 * the only thing on screen telling you whether anything is happening:
 *
 *   idle       slow breathing, dim            nothing is happening
 *   listening  ring draws inward, brightens   your turn was accepted
 *   thinking   ring spins, dot orbits         a tool is running or tokens are coming
 *   speaking   core pulses with the stream    text is arriving
 *
 * Drawn as inline SVG rather than divs so it stays crisp at any size, and animated on
 * transform/opacity only so the compositor can handle it without layout work.
 */
export function AgentOrb({
  state = "idle",
  size = 44,
  className,
}: {
  state?: OrbState;
  size?: number;
  className?: string;
}) {
  // Respect the OS setting. The whole point of this thing is ambient motion, so where
  // that is unwelcome it becomes a static mark rather than a slower animation.
  const still = useReducedMotion();
  const busy = state === "thinking";
  const active = state !== "idle";

  const label = {
    idle: "Assistant, idle",
    listening: "Assistant, listening",
    thinking: "Assistant, thinking",
    speaking: "Assistant, replying",
  }[state];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={label}
    >
      <defs>
        <radialGradient id="orb-core" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#7BEABE" />
          <stop offset="55%" stopColor="#31DB90" />
          <stop offset="100%" stopColor="#0E9F6E" />
        </radialGradient>
        <linearGradient id="orb-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#31DB90" />
          <stop offset="50%" stopColor="#1FC7E6" />
          <stop offset="100%" stopColor="#31DB90" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* glow — widens when active so the orb reads as awake from peripheral vision */}
      <motion.circle
        cx="50"
        cy="50"
        r="30"
        fill="url(#orb-core)"
        style={{ filter: "blur(14px)" }}
        animate={
          still
            ? { opacity: active ? 0.4 : 0.22 }
            : {
                opacity: active ? [0.32, 0.5, 0.32] : [0.16, 0.26, 0.16],
                scale: active ? [1, 1.14, 1] : [1, 1.06, 1],
              }
        }
        transition={{
          duration: busy ? 1.6 : 3.6,
          repeat: still ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />

      {/* orbit ring — the clearest "working" signal, so it only spins while busy */}
      <motion.g
        style={{ originX: "50px", originY: "50px" }}
        animate={still || !busy ? { rotate: 0 } : { rotate: 360 }}
        transition={{
          duration: 2.4,
          repeat: busy && !still ? Infinity : 0,
          ease: "linear",
        }}
      >
        <motion.circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="url(#orb-ring)"
          strokeWidth="2.5"
          strokeLinecap="round"
          animate={{
            opacity: busy ? 1 : active ? 0.55 : 0.28,
            // A gap in the dash makes the rotation legible; closed when idle.
            strokeDasharray: busy ? "58 180" : "238 0",
          }}
          transition={{ duration: 0.4 }}
        />
        {busy && !still && (
          <circle cx="50" cy="12" r="3.4" fill="#1FC7E6">
            <animate
              attributeName="opacity"
              values="1;0.35;1"
              dur="1.2s"
              repeatCount="indefinite"
            />
          </circle>
        )}
      </motion.g>

      {/* listening: a ring contracting inward, so accepting input feels physical */}
      {state === "listening" && !still && (
        <motion.circle
          cx="50"
          cy="50"
          fill="none"
          stroke="#31DB90"
          strokeWidth="2"
          initial={{ r: 46, opacity: 0.7 }}
          animate={{ r: 30, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      {/* core */}
      <motion.circle
        cx="50"
        cy="50"
        r="24"
        fill="url(#orb-core)"
        animate={
          still
            ? { scale: 1 }
            : state === "speaking"
              ? { scale: [1, 1.09, 0.97, 1.05, 1] }
              : busy
                ? { scale: [1, 0.94, 1] }
                : { scale: [1, 1.035, 1] }
        }
        transition={{
          duration: state === "speaking" ? 0.9 : busy ? 1.2 : 3.4,
          repeat: still ? 0 : Infinity,
          ease: "easeInOut",
        }}
        style={{ originX: "50px", originY: "50px" }}
      />

      {/* specular highlight — cheap way to read as a sphere rather than a flat disc */}
      <ellipse cx="42" cy="40" rx="8" ry="6" fill="#FFFFFF" opacity="0.32" />

      {/* the K, so it is unmistakably Kred and not a generic assistant blob */}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="20"
        fontWeight="700"
        fill="#05231A"
        opacity="0.82"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        K
      </text>
    </svg>
  );
}
