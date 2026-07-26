import type { MetadataRoute } from "next";

/** Crawl rules. Everything marketing is fair game; /verify is not.
 *
 *  A disclosure link is scoped to whoever the owner sends it to, its OG card renders the
 *  income figure (and the wallet when disclosed), and there is no delete endpoint — so an
 *  indexed page or a cached copy in Google Images would be permanent and unrevocable.
 *  The page itself also sets robots:noindex (app/verify/[id]/page.tsx); this covers the
 *  image route beside it, which carries no meta tags of its own.
 *
 *  Link unfurlers are carved back out: they fetch one card for one paste rather than
 *  building an index, and they are what makes a share link render at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/verify/" },
      {
        userAgent: [
          "Twitterbot",
          "Slackbot",
          "Slackbot-LinkExpanding",
          "facebookexternalhit",
          "Discordbot",
          "WhatsApp",
          "TelegramBot",
          "LinkedInBot",
          "redditbot",
        ],
        allow: "/",
      },
    ],
  };
}
