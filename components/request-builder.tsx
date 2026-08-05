"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { buildRequestPath } from "@/lib/request";
import { TOKENS, type TokenSymbol } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { MonthPicker } from "@/components/ui/month-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PayForm } from "@/components/pay-form";

const CATEGORIES = [
  "development",
  "design",
  "consulting",
  "writing",
  "marketing",
  "retainer",
  "other",
];

/** Short random salt. Only needs to be unique per request, not unguessable — it
 *  distinguishes escrows, it does not protect them. */
function newNonce(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function RequestBuilder() {
  const { address } = useAccount();
  const [to, setTo] = useState("");
  const [form, setForm] = useState({
    token: "USDC" as TokenSymbol,
    amount: "",
    client: "",
    project: "",
    invoice: "",
    period: "",
    category: "",
    note: "",
  });
  const [copied, setCopied] = useState(false);

  // One salt per visit to this page, so each link issued from it is its own escrow.
  // Held steady while the form is edited — regenerating per keystroke would change
  // the link, and the escrow id, underneath someone still typing.
  const nonce = useMemo(newNonce, []);

  // Default the recipient to the connected wallet once it's known.
  useEffect(() => {
    if (address && !to) setTo(address);
  }, [address, to]);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = isAddress(to) && Number(form.amount) > 0;

  const path = useMemo(
    () => (valid ? buildRequestPath({ to: to as `0x${string}`, ...form, nonce }) : ""),
    [valid, to, form, nonce],
  );
  const url =
    path && typeof window !== "undefined"
      ? window.location.origin + path
      : path;

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Payment link copied", {
      description: "Send it to your client, the memo rides along.",
    });
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <GlassCard className="p-6">
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div>
            <Label>Recipient (you)</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x…"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>Token</Label>
            <Select
              value={form.token}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, token: v as TokenSymbol }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOKENS.map((t) => (
                  <SelectItem key={t.symbol} value={t.symbol}>
                    {t.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3">
          <Label>Amount</Label>
          <Input
            value={form.amount}
            onChange={set("amount")}
            inputMode="decimal"
            placeholder="1250.00"
          />
        </div>

        <div className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Memo (travels on-chain with the payment)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Client</Label>
            <Input value={form.client} onChange={set("client")} placeholder="Acme Inc" />
          </div>
          <div>
            <Label>Project</Label>
            <Input
              value={form.project}
              onChange={set("project")}
              placeholder="Website redesign"
            />
          </div>
          <div>
            <Label>Invoice #</Label>
            <Input
              value={form.invoice}
              onChange={set("invoice")}
              placeholder="INV-2026-014"
            />
          </div>
          <div>
            <Label>Period</Label>
            <MonthPicker
              value={form.period}
              onChange={(v) => setForm((f) => ({ ...f, period: v }))}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
            >
              <SelectTrigger className="capitalize">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note</Label>
            <Input value={form.note} onChange={set("note")} placeholder="March retainer" />
          </div>
        </div>

        <div className="mt-6">
          <Label>Shareable link</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={valid ? url : ""}
              placeholder="Fill recipient + amount to generate a link"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={copy}
              disabled={!valid}
              className="shrink-0 gap-1.5"
            >
              {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          {valid && (
            <a
              href={path}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline",
              )}
            >
              Open payer page
              <ExternalLink className="size-3" />
            </a>
          )}

          {/* Escrow lives on the payer's side of this link, so without saying it here
              the freelancer never learns it exists and cannot offer it to a client. */}
          <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            Your client can pay this straight away, or commit the funds to escrow on
            the same link and release them as you deliver. Either way it lands here
            already categorized. Set an invoice number if you expect escrow, since
            that is what stops two invoices sharing one escrow.
          </p>
        </div>
      </GlassCard>

      {/* live preview of the payer's page */}
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payer sees
        </div>
        {valid ? (
          <PayForm
            request={{ to: to as `0x${string}`, ...form }}
          />
        ) : (
          <Card className="flex h-64 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Fill in a recipient and amount to preview the payer page.
          </Card>
        )}
      </div>
    </div>
  );
}
