import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />
        <path
          d="M9 22V10.5A1.5 1.5 0 0 1 10.5 9H19a4.5 4.5 0 0 1 0 9h-6"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 6.5v19"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="tracking-tight">Payslip</span>
    </span>
  );
}
