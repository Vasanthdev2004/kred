"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSetTag, type TagInput } from "@/hooks/use-tags";

const CATEGORIES = [
  "development",
  "design",
  "consulting",
  "writing",
  "marketing",
  "retainer",
  "other",
];

export interface TagDraft {
  client?: string | null;
  project?: string | null;
  category?: string | null;
  invoice?: string | null;
  period?: string | null;
  note?: string | null;
}

export function TagDialog({
  open,
  onClose,
  txHash,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  txHash: string;
  initial?: TagDraft;
}) {
  const setTag = useSetTag();
  const [form, setForm] = useState<TagDraft>({
    client: initial?.client ?? "",
    project: initial?.project ?? "",
    category: initial?.category ?? "",
    invoice: initial?.invoice ?? "",
    period: initial?.period ?? "",
    note: initial?.note ?? "",
  });

  const set =
    (k: keyof TagDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: TagInput = {
      txHash,
      client: form.client || null,
      project: form.project || null,
      category: form.category || null,
      invoice: form.invoice || null,
      period: form.period || null,
      note: form.note || null,
    };
    await setTag.mutateAsync(payload);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tag this payment"
      description="Metadata only — this never changes the on-chain amount."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>Client</Label>
          <Input
            value={form.client ?? ""}
            onChange={set("client")}
            placeholder="Acme Inc"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Project</Label>
            <Input
              value={form.project ?? ""}
              onChange={set("project")}
              placeholder="Website redesign"
            />
          </div>
          <div>
            <Label>Category</Label>
            <select
              value={form.category ?? ""}
              onChange={set("category")}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Invoice #</Label>
            <Input
              value={form.invoice ?? ""}
              onChange={set("invoice")}
              placeholder="INV-2026-014"
            />
          </div>
          <div>
            <Label>Period</Label>
            <Input type="month" value={form.period ?? ""} onChange={set("period")} />
          </div>
        </div>
        <div>
          <Label>Note</Label>
          <Input
            value={form.note ?? ""}
            onChange={set("note")}
            placeholder="March retainer"
          />
        </div>
        {setTag.isError && (
          <p className="text-sm text-destructive">Couldn&apos;t save — try again.</p>
        )}
        <Button type="submit" className="w-full" disabled={setTag.isPending}>
          {setTag.isPending ? "Saving…" : "Save tag"}
        </Button>
      </form>
    </Modal>
  );
}
