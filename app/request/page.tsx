import type { Metadata } from "next";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RequestBuilder } from "@/components/request-builder";

export const metadata: Metadata = {
  title: "Request a payment · Payslip",
};

export default function RequestPage() {
  return (
    <div className="container max-w-5xl py-10">
      <PageHeader
        icon={Send}
        eyebrow="Get paid"
        title="Request a payment"
        description="Generate a link that attaches an invoice/project memo to the incoming payment — when your client pays, it lands in your Payslip already categorized. No account needed on their side."
      />
      <RequestBuilder />
    </div>
  );
}
