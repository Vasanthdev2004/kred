"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseRequest } from "@/lib/request";
import { PayForm } from "@/components/pay-form";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";

export function PayPage() {
  const sp = useSearchParams();
  const request = parseRequest(new URLSearchParams(sp.toString()));

  return (
    <div className="mx-auto flex min-h-[85vh] max-w-md flex-col items-center justify-center px-5 py-12">
      <Link href="/" className="mb-8">
        <Logo className="text-lg" />
      </Link>

      {request ? (
        <div className="w-full">
          <PayForm request={request} />
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="font-medium">Invalid payment link</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This request is missing a valid recipient, token, or amount.
          </p>
        </Card>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Powered by Payslip on Arc · the memo travels with your payment.
      </p>
    </div>
  );
}
