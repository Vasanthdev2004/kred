import { Button } from "@/components/ui/button";

/** X's wordmark isn't in lucide (its `X` export is a close icon), so it's inlined. */
function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Post a verify link to X. The unfurl is rendered by app/verify/[id]/opengraph-image,
 *  so the card X shows is the disclosure itself, not the generic site image. */
export function ShareOnX({
  url,
  text,
  className,
}: {
  url: string;
  text: string;
  className?: string;
}) {
  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;

  return (
    <Button asChild variant="outline" className={className}>
      <a href={intent} target="_blank" rel="noreferrer">
        <XGlyph />
        Share on X
      </a>
    </Button>
  );
}
