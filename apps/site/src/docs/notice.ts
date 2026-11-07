/**
 * The notice a page shows when it renders English text in place of a missing
 * or stale translation. English by design: the notice sits beside the English
 * text it announces.
 */
export const TRANSLATION_NOTICE = {
  missing: "This page has not been translated yet. The English text is shown.",
  stale: "This translation is out of date. The English text is shown.",
  readEnglish: "Open the English page",
} as const;
