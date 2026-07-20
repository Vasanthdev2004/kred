import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Statement } from "@/components/statement";

export const metadata: Metadata = {
  title: "Income statement · Payslip",
};

export default function StatementPage() {
  return (
    <div className="container max-w-5xl py-10">
      <PageHeader
        icon={FileText}
        eyebrow="Report"
        title="Income statement"
        description="Aggregate any period into totals by client and category, with a monthly trend — then export a branded PDF where every line is backed by an on-chain tx hash."
      />
      <Statement />
    </div>
  );
}
