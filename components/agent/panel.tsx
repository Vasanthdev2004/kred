"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowUp, Check, Copy, ExternalLink, Square, X } from "lucide-react";
import { toast } from "sonner";
import { cn, shorten } from "@/lib/utils";
import { usePreviewAddress } from "@/lib/preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentOrb, type OrbState } from "@/components/agent/orb";

interface Proposal {
  txHash: string;
  client?: string;
  project?: string;
  category?: string;
  reason?: string;
}

interface DisclosurePreview {
  periodStart?: string;
  periodEnd?: string;
  paymentCount?: number;
  totals?: { token: string; amount: string }[];
  willReveal?: string[];
}

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Rendered under the message as things to act on, not prose to read. */
  proposals?: Proposal[];
  requestPath?: string;
  disclosure?: DisclosurePreview;
  untag?: { txHashes: string[]; reason?: string };
}

const SUGGESTIONS = [
  "Who paid me, and how much?",
  "Which payments are untagged?",
  "Draft an invoice for 1200 USDC",
];

let nextId = 1;

/**
 * Flatten the markdown the model still reaches for occasionally.
 *
 * The system prompt asks it not to, but a prompt is a request, not a guarantee — and
 * when it slips, a pipe table arrives as literal `|---|---|` grid characters that
 * blow out a 24rem panel. Cheaper and more reliable to strip it on the way in than to
 * ship a markdown renderer for output that should have been plain lines anyway.
 */
function tidy(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\s*\|?[\s:|-]{6,}\|?\s*$/.test(l)) // separator rows
    .map((l) => {
      const t = l.trim();
      if (t.startsWith("|") && t.endsWith("|")) {
        // A table row becomes its cells, space-separated.
        return t.slice(1, -1).split("|").map((c) => c.trim()).filter(Boolean).join("  ");
      }
      return l;
    })
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/\n{3,}/g, "\n\n")
    // A plain hyphen is a valid line-break opportunity, so "2026-07-20" was
    // splitting as "2026-07-" / "20" at the bubble edge. Non-breaking hyphens
    // (U+2011) look identical and keep the date whole.
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$1‑$2‑$3")
    .trim();
}

export function AgentPanel({ onClose }: { onClose: () => void }) {
  const { address: wagmiAddress } = useAccount();
  const preview = usePreviewAddress();
  const address = wagmiAddress ?? preview;
  const qc = useQueryClient();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [state, setState] = useState<OrbState>("idle");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the stream, but only from the bottom — yanking the view while someone is
  // reading an earlier answer is worse than a slightly stale scroll position.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const dismiss = useCallback((txHash: string, msgId: number) => {
    setMessages((m) =>
      m.map((msg) =>
        msg.id === msgId
          ? { ...msg, proposals: msg.proposals?.filter((p) => p.txHash !== txHash) }
          : msg,
      ),
    );
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const mine: Msg = { id: nextId++, role: "user", text: content };
      const history = [...messages, mine];
      setMessages(history);
      setDraft("");
      setBusy(true);
      setState("listening");
      setStreaming("");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let acc = "";
      const proposals: Proposal[] = [];
      let requestPath: string | undefined;
      let disclosure: DisclosurePreview | undefined;
      let untag: { txHashes: string[]; reason?: string } | undefined;

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            address,
            messages: history.map((m) => ({ role: m.role, content: m.text })),
          }),
        });

        if (!res.ok || !res.body) {
          const payload = await res.json().catch(() => null);
          const msg =
            res.status === 503
              ? "The assistant isn't switched on yet."
              : res.status === 429
                ? (payload?.error ?? "Too many requests, give it a moment.")
                : "Couldn't reach the assistant.";
          setMessages((m) => [...m, { id: nextId++, role: "assistant", text: msg }]);
          return;
        }

        setState("thinking");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let carry = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          carry += decoder.decode(value, { stream: true });
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";

          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            let ev: { type: string; value?: string; kind?: string; data?: unknown };
            try {
              ev = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (ev.type === "text" && ev.value) {
              acc += ev.value;
              setState("speaking");
              setStreaming(acc);
            } else if (ev.type === "tool") {
              setState("thinking");
            } else if (ev.type === "surface") {
              if (ev.kind === "proposals" && Array.isArray(ev.data)) {
                proposals.push(...(ev.data as Proposal[]));
              } else if (ev.kind === "request") {
                requestPath = (ev.data as { path?: string })?.path;
              } else if (ev.kind === "disclosure") {
                disclosure = ev.data as DisclosurePreview;
              } else if (ev.kind === "untag") {
                untag = ev.data as { txHashes: string[]; reason?: string };
              }
            } else if (ev.type === "error" && ev.value) {
              acc += (acc ? "\n\n" : "") + ev.value;
              setStreaming(acc);
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          acc ||= "The assistant stopped unexpectedly. Try again.";
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        setState("idle");
        setStreaming("");
        if (acc || proposals.length || requestPath || disclosure || untag) {
          setMessages((m) => [
            ...m,
            {
              id: nextId++,
              role: "assistant",
              text: acc,
              proposals: proposals.length ? proposals : undefined,
              requestPath,
              disclosure,
              untag,
            },
          ]);
        }
      }
    },
    [address, busy, messages],
  );

  /** Accepting a suggestion is the only write in this whole feature, and it happens
   *  here — in the user's hands, through the same endpoint the manual tag dialog
   *  uses. The agent never reaches the database itself. */
  const accept = useCallback(
    async (p: Proposal, msgId: number) => {
      if (!address) return;
      try {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address,
            txHash: p.txHash,
            logIndex: 0,
            client: p.client ?? null,
            project: p.project ?? null,
            category: p.category ?? null,
          }),
        });
        if (!res.ok) {
          // Say what actually failed. "Couldn't save that tag" hid a malformed
          // txHash for far too long.
          const detail = await res
            .json()
            .then((j) => j?.error)
            .catch(() => null);
          throw new Error(
            typeof detail === "string" ? detail : `save failed (${res.status})`,
          );
        }
        toast.success(`Tagged ${p.client ?? "payment"}`);
        qc.invalidateQueries({ queryKey: ["tags"] });
        dismiss(p.txHash, msgId);
      } catch (err) {
        toast.error(
          err instanceof Error ? `Couldn't save: ${err.message}` : "Couldn't save that tag.",
        );
      }
    },
    [address, qc, dismiss],
  );

  /** Bulk apply. Sequential rather than parallel: these are writes against the
   *  user's own records and a burst of concurrent POSTs buys nothing but a harder
   *  failure to reason about. Reports partial success honestly. */
  const acceptAll = useCallback(
    async (ps: Proposal[], msgId: number) => {
      let ok = 0;
      for (const p of ps) {
        // eslint-disable-next-line no-await-in-loop
        const done = await acceptOne(p);
        if (done) {
          ok += 1;
          dismiss(p.txHash, msgId);
        }
      }
      if (ok) qc.invalidateQueries({ queryKey: ["tags"] });
      if (ok === ps.length) toast.success(`Tagged ${ok} payments`);
      else if (ok) toast.warning(`Tagged ${ok} of ${ps.length}; the rest failed`);
      else toast.error("Couldn't save those tags.");
    },
    // acceptOne is declared below and is stable for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, qc, dismiss],
  );

  /** Single write, no toast — shared by accept() and acceptAll() so bulk mode does
   *  not fire one notification per row. */
  async function acceptOne(p: Proposal): Promise<boolean> {
    if (!address) return false;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address,
          txHash: p.txHash,
          logIndex: 0,
          client: p.client ?? null,
          project: p.project ?? null,
          category: p.category ?? null,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Removing tags is a delete, so it happens here on an explicit confirmation and
   *  through the same endpoint the manual UI uses. The agent only ever asked. */
  const untagAll = useCallback(
    async (hashes: string[], msgId: number) => {
      if (!address) return;
      let ok = 0;
      for (const h of hashes) {
        try {
          const res = await fetch(
            `/api/tags?address=${address}&txHash=${h}&logIndex=0`,
            { method: "DELETE" },
          );
          if (res.ok) ok += 1;
        } catch {
          /* counted as a failure below */
        }
      }
      if (ok) qc.invalidateQueries({ queryKey: ["tags"] });
      if (ok === hashes.length)
        toast.success(`Removed ${ok} tag${ok === 1 ? "" : "s"}`);
      else if (ok) toast.warning(`Removed ${ok} of ${hashes.length}`);
      else toast.error("Couldn't remove those tags.");
      setMessages((m) =>
        m.map((x) => (x.id === msgId ? { ...x, untag: undefined } : x)),
      );
    },
    [address, qc],
  );

  const empty = messages.length === 0 && !streaming;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <AgentOrb state={state} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Kred assistant</div>
          <div className="truncate text-xs text-muted-foreground">
            {address
              ? `Reading ${shorten(address, 4)}`
              : "Connect a wallet to read income"}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close assistant"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* transcript */}
      <div
        ref={scrollRef}
        className="agent-scroll flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4"
      >
        {empty && (
          <div className="pt-6 text-center">
            <AgentOrb state="idle" size={64} className="mx-auto" />
            <p className="mt-4 text-sm font-medium">Ask about your income</p>
            <p className="mx-auto mt-1 max-w-[15rem] text-xs text-muted-foreground">
              It reads your payments from Arc. It suggests, you confirm. It never
              moves money.
            </p>
            <div className="mt-5 space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Bubble key={m.id} msg={m} onAccept={accept} onAcceptAll={acceptAll} onDismiss={dismiss} onUntag={untagAll} />
        ))}

        {streaming && (
          <Bubble
            msg={{ id: -1, role: "assistant", text: streaming }}
            onAccept={accept}
            onAcceptAll={acceptAll}
            onDismiss={dismiss}
            onUntag={untagAll}
          />
        )}
      </div>

      {/* composer */}
      <div className="border-t border-border/60 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={address ? "Ask about your income…" : "Connect a wallet first"}
            className="h-9 text-sm"
            disabled={busy}
          />
          {busy ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 shrink-0 px-3"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop"
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              className="h-9 shrink-0 px-3"
              disabled={!draft.trim()}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function Bubble({
  msg,
  onAccept,
  onAcceptAll,
  onDismiss,
  onUntag,
}: {
  msg: Msg;
  onAccept: (p: Proposal, msgId: number) => void;
  onAcceptAll: (ps: Proposal[], msgId: number) => void;
  onDismiss: (txHash: string, msgId: number) => void;
  onUntag: (hashes: string[], msgId: number) => void;
}) {
  const mine = msg.role === "user";
  return (
    <div className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      {msg.text && (
        <div
          className={cn(
            // break-words, deliberately NOT overflow-wrap:anywhere — `anywhere`
            // breaks eagerly and was splitting dates as "2026-07-" / "20".
            // break-word only breaks a token that cannot fit a line on its own,
            // which still catches a full 42-char address.
            "max-w-[88%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-relaxed",
            mine
              ? "bg-primary text-primary-foreground"
              : "border border-border/60 bg-secondary/50",
          )}
        >
          {tidy(msg.text)}
        </div>
      )}

      {/* Tagging a month of payments one card at a time is a chore, so offer the
          bulk action — but only once there are enough to be worth it. */}
      {(msg.proposals?.length ?? 0) > 1 && (
        <div className="flex w-[88%] items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {msg.proposals!.length} suggestions
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => onAcceptAll(msg.proposals!, msg.id)}
          >
            <Check className="size-3.5" />
            Apply all
          </Button>
        </div>
      )}

      {msg.proposals?.map((p) => (
        <ProposalCard
          key={p.txHash}
          p={p}
          onAccept={() => onAccept(p, msg.id)}
          onDismiss={() => onDismiss(p.txHash, msg.id)}
        />
      ))}

      {msg.untag && (
        <UntagCard
          txHashes={msg.untag.txHashes}
          reason={msg.untag.reason}
          onConfirm={() => onUntag(msg.untag!.txHashes, msg.id)}
        />
      )}

      {msg.requestPath && <RequestCard path={msg.requestPath} />}
      {msg.disclosure && <DisclosureCard d={msg.disclosure} />}
    </div>
  );
}

/** A suggestion, explicitly framed as unsaved until the user says so. */
function ProposalCard({
  p,
  onAccept,
  onDismiss,
}: {
  p: Proposal;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-[88%] rounded-xl border border-primary/25 bg-primary/5 p-3"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Suggested tag · not saved
      </div>
      <div className="mt-1.5 space-y-0.5 text-sm">
        {p.client && (
          <div>
            <span className="text-muted-foreground">Client </span>
            <span className="font-medium">{p.client}</span>
          </div>
        )}
        {p.project && (
          <div>
            <span className="text-muted-foreground">Project </span>
            <span className="font-medium">{p.project}</span>
          </div>
        )}
        {p.category && (
          <div>
            <span className="text-muted-foreground">Category </span>
            <span className="font-medium">{p.category}</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
        {shorten(p.txHash, 6)}
      </div>
      {p.reason && <p className="mt-1.5 text-xs text-muted-foreground">{p.reason}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={onAccept}>
          <Check className="size-3.5" />
          Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs"
          onClick={onDismiss}
        >
          Skip
        </Button>
      </div>
    </motion.div>
  );
}

/** What a verify link would reveal, shown before one exists. The point is that the
 *  user sees the disclosure before deciding, so this card never creates anything —
 *  it ends at a link to /share where they do. */
function DisclosureCard({ d }: { d: DisclosurePreview }) {
  const period =
    d.periodStart && d.periodEnd
      ? d.periodStart === d.periodEnd
        ? d.periodStart
        : `${d.periodStart} to ${d.periodEnd}`
      : null;

  const OPTIONAL: Record<string, string> = {
    period: "Period",
    count: "Payment count",
    clients: "Client count",
    wallet: "Wallet address",
  };
  const revealed = d.willReveal ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-[88%] rounded-xl border border-border/70 bg-secondary/40 p-3"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Verify link preview · not created
      </div>

      {period && <div className="mt-1.5 text-sm font-medium">{period}</div>}

      {/* Per token. Never a combined figure — there is no FX rate in this app. */}
      <div className="mt-2 space-y-0.5">
        {d.totals?.map((t) => (
          <div key={t.token} className="font-mono text-sm nums">
            {t.amount}{" "}
            <span className="text-xs text-muted-foreground">{t.token}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        {d.paymentCount} payment{d.paymentCount === 1 ? "" : "s"} · totals and
        backing transactions are always shown
      </div>

      {revealed.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {revealed.map((f) => (
            <span
              key={f}
              className="rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[11px]"
            >
              {OPTIONAL[f] ?? f}
            </span>
          ))}
        </div>
      )}

      <a
        href="/share"
        className="mt-3 inline-flex h-7 w-full items-center justify-center gap-1 rounded-md border border-border text-xs transition-colors hover:bg-secondary"
      >
        Create it on Share <ExternalLink className="size-3" />
      </a>
    </motion.div>
  );
}

/** A request to delete manual tags. Framed as a removal, not a suggestion, because
 *  it destroys data — and named as reversible, because it is: the payment is
 *  untouched and can be tagged again. */
function UntagCard({
  txHashes,
  reason,
  onConfirm,
}: {
  txHashes: string[];
  reason?: string;
  onConfirm: () => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-[88%] rounded-xl border border-destructive/30 bg-destructive/5 p-3"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Remove tags · not removed yet
      </div>
      <p className="mt-1.5 text-sm">
        {txHashes.length} manual tag{txHashes.length === 1 ? "" : "s"} will be cleared.
      </p>
      {reason && <p className="mt-1 text-xs text-muted-foreground">{reason}</p>}
      <p className="mt-1.5 text-xs text-muted-foreground">
        The payments themselves are untouched, and you can tag them again later.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          className="h-7 flex-1 text-xs"
          disabled={done}
          onClick={() => {
            setDone(true);
            onConfirm();
          }}
        >
          Remove {txHashes.length}
        </Button>
      </div>
    </motion.div>
  );
}

function RequestCard({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-[88%] rounded-xl border border-border/70 bg-secondary/40 p-3"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Payment request · send this to your client
      </div>
      <div className="mt-1.5 break-all font-mono text-[11px] text-muted-foreground">
        {url}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 gap-1 text-xs"
          onClick={() => {
            navigator.clipboard.writeText(url).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              },
              () => toast.error("Couldn't copy"),
            );
          }}
        >
          {copied ? (
            <Check className="size-3.5 text-primary" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-3 text-xs transition-colors hover:bg-secondary"
        >
          Open <ExternalLink className="size-3" />
        </a>
      </div>
    </motion.div>
  );
}
