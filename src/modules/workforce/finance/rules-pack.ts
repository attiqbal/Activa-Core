/**
 * A rules pack tells the Finance manager how to keep the books so they meet
 * a country's record-keeping requirements. It is about bookkeeping, not tax
 * advice: the pack says what records and categories are needed and when a
 * qualified accountant must review. It never says how to reduce tax.
 *
 * Country packs are added one at a time. Each must be reviewed by a
 * qualified local accountant before it is marked `reviewed: true`.
 */
export interface RulesPack {
  /** ISO 3166 country code, or "GENERIC". */
  country: string;
  name: string;
  /** Has a qualified local accountant checked this pack? */
  reviewed: boolean;
  /** Plain-language record-keeping requirements given to the model. */
  recordKeeping: string[];
  /** Details the pack does not cover and the model must not guess. */
  doNotGuess: string[];
}

/**
 * Safe default for any country without its own pack: good general
 * bookkeeping that works anywhere, with clear flags where local rules apply.
 */
export const GENERIC_PACK: RulesPack = {
  country: "GENERIC",
  name: "General bookkeeping",
  reviewed: false,
  recordKeeping: [
    "Record every transaction with its date, amount, currency, counterparty and a short description.",
    "Keep a source document (invoice, receipt, statement line) for every entry and say where it is missing.",
    "Use double-entry bookkeeping: every entry has equal debits and credits. Keep a chart of accounts, a general ledger and a trial balance.",
    "Separate income, cost of sales, operating expenses, assets, liabilities and owner's equity.",
    "Keep sales tax or VAT/GST on invoices and purchases as its own lines, not mixed into the price, when the business charges or pays it.",
    "Keep records in the business's base currency and note the exchange rate and date for any foreign-currency entry.",
    "Close the books by month and by the business's financial year, and never change a closed period without recording an adjusting entry.",
  ],
  doNotGuess: [
    "the tax rates, thresholds, filing dates and registration rules that apply in the owner's country",
    "how long records must be kept and the exact legal invoice format",
    "any tax planning, optimisation or filing decision",
  ],
};

const PACKS = new Map<string, RulesPack>([[GENERIC_PACK.country, GENERIC_PACK]]);

export function registerPack(pack: RulesPack): void {
  PACKS.set(pack.country.toUpperCase(), pack);
}

/** Country pack if one exists, otherwise the generic pack. */
export function packFor(country?: string): RulesPack {
  return (country ? PACKS.get(country.toUpperCase()) : undefined) ?? GENERIC_PACK;
}

export function describePack(pack: RulesPack): string {
  const lines = [
    `Bookkeeping rules pack: ${pack.name}${pack.country === "GENERIC" ? "" : ` (${pack.country})`}.`,
    pack.reviewed
      ? "This pack was reviewed by a qualified accountant."
      : "This pack has NOT been reviewed by a local accountant. Tell the owner to have an accountant check the books before they rely on them for filing.",
    "Keep the books to these requirements:",
    ...pack.recordKeeping.map((r) => `- ${r}`),
    "You do not know, so do not guess:",
    ...pack.doNotGuess.map((r) => `- ${r}`),
  ];
  return lines.join("\n");
}
