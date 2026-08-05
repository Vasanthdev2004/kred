/**
 * The exact string a wallet signs to list its own verify links.
 *
 * Lives in its own module so the client and the server check share one definition and
 * cannot drift — and so the client never imports the route handler, which would drag
 * Prisma into the browser bundle.
 *
 * Worded for the person reading their wallet prompt: this reads a list, it moves
 * nothing.
 */
export function listChallenge(address: string, ts: number): string {
  return [
    "Kred: list my verify links",
    "",
    `Wallet: ${address.toLowerCase()}`,
    `Time: ${new Date(ts).toISOString()}`,
    "",
    "This only reads your own links. It does not move funds or change anything.",
  ].join("\n");
}
