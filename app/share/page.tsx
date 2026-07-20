import type { Metadata } from "next";
import { ShareBuilder } from "@/components/share-builder";

export const metadata: Metadata = {
  title: "Share a verify link · Payslip",
};

export default function SharePage() {
  return (
    <div className="container max-w-4xl py-10">
      <h1 className="text-2xl font-bold tracking-tight">Share a verify link</h1>
      <p className="mt-1 mb-8 max-w-2xl text-sm text-muted-foreground">
        Publish a link that proves your income for a period. The verifier&apos;s page
        recomputes every figure from Arc on-chain data — they never have to trust you,
        or us. Choose what extra detail to reveal.
      </p>
      <ShareBuilder />
    </div>
  );
}
