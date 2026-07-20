import { Suspense } from "react";
import { PayPage } from "@/components/pay-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PayPage />
    </Suspense>
  );
}
