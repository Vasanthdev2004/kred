import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DisclosuresList } from "@/components/disclosures-list";

export const metadata: Metadata = {
  title: "My verify links",
  // Owner-only management view. Nothing here should ever be indexed or previewed.
  robots: { index: false, follow: false },
};

export default function LinksPage() {
  return (
    <div className="container max-w-3xl py-10">
      <PageHeader
        icon={Link2}
        eyebrow="Manage"
        title="My verify links"
        description="Every proof you've published, and what each one reveals. Copy a link to send it again, or withdraw one on-chain so it stops showing your figures."
      />
      <DisclosuresList />
    </div>
  );
}
