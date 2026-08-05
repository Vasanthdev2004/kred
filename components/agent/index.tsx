"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { usePreviewAddress } from "@/lib/preview";
import { AgentOrb } from "@/components/agent/orb";
import { AgentPanel } from "@/components/agent/panel";

/** Pages that belong to someone who is NOT the account holder. A verifier opening a
 *  proof link, or a client paying an invoice, should never be offered a tool that
 *  reads the owner's income — it isn't theirs to read, and on /verify it would
 *  undercut the whole point of a page that stands on its own. */
const PUBLIC_ROUTES = ["/verify", "/pay"];

/**
 * Floating launcher for the assistant.
 *
 * Mounted once in the root layout and gated here, rather than per page: the rule is
 * "an owner looking at their own data", which is a property of the session and the
 * route, not of any one screen.
 */
export function AgentLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isConnected } = useAccount();
  const preview = usePreviewAddress();
  const pathname = usePathname();

  // Wallet state is only known client-side; rendering the button before hydration
  // would flash it onto the landing page for everyone.
  useEffect(() => setMounted(true), []);

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

  const isPublicPage = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname?.startsWith(`${r}/`),
  );
  if (!mounted || isPublicPage || (!isConnected && !preview)) return null;

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
