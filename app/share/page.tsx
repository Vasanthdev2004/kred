import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ShareBuilder } from "@/components/share-builder";

export const metadata: Metadata = {
  title: "Share a verify link · Payslip",
};

export default function SharePage() {
  return (
    <div className="container max-w-4xl py-10">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Prove it"
        title="Share a verify link"
        description="Publish a link that proves your income for a period. The verifier's page recomputes every figure from Arc on-chain data — they never have to trust you, or us. You choose what extra detail to reveal."
      />
      <ShareBuilder />
    </div>
  );
}
