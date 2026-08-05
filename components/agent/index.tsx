"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentOrb } from "@/components/agent/orb";
import { AgentPanel } from "@/components/agent/panel";

/**
 * Floating launcher for the assistant.
 *
 * Mounted from the dashboard rather than the root layout, so it never appears over
 * the marketing landing page — the assistant is only useful once there is a wallet
 * whose income it can read.
 */
export function AgentLauncher() {
  const [open, setOpen] = useState(false);

  // Escape closes it, which is the one keyboard affordance people reach for without
  // being told.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            role="dialog"
            aria-label="Kred assistant"
            className="fixed bottom-24 right-5 z-50 flex h-[min(34rem,calc(100dvh-9rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl"
          >
            <AgentPanel onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full border border-border/70 bg-card/90 shadow-xl backdrop-blur-xl transition-colors hover:border-primary/50"
      >
        <AgentOrb state={open ? "listening" : "idle"} size={34} />
      </motion.button>
    </>
  );
}
