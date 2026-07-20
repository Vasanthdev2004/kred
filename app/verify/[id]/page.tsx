import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address, Hex } from "viem";
import { db } from "@/lib/db";
import { serverClient } from "@/lib/rpc";
import { recompute } from "@/lib/verify";
import { VerifyView } from "@/components/verify-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verified income · Payslip",
  description: "Income proof recomputed live from Arc on-chain data.",
};

export default async function VerifyPage({
  params,
}: {
  params: { id: string };
}) {
  const d = await db.disclosure.findUnique({ where: { id: params.id } });
  if (!d) notFound();

  let txHashes: Hex[] = [];
  let fields: string[] = [];
  try {
    txHashes = JSON.parse(d.txHashes) as Hex[];
    fields = JSON.parse(d.fields) as string[];
  } catch {
    /* corrupt record — recompute will simply verify nothing */
  }

  const result = await recompute(serverClient(), d.address as Address, txHashes);

  return (
    <VerifyView
      disclosure={{
        address: d.address,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        label: d.label,
      }}
      fields={new Set(fields)}
      result={result}
    />
  );
}
