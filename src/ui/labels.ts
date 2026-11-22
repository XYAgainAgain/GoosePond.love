import { COPY } from "../copy.ts";
import { formatDate } from "../records/dates.ts";
import type { Certainty, EventKind, FuzzyDate, InterestRole } from "../records/types.ts";

export const EVENT_LABEL: Record<EventKind, string> = COPY.events.labels;

export const ROLE_LABEL: Record<InterestRole, string> = COPY.roles.labels;

/* Empty for documented or unstated certainty */
export function certaintyNote(c: Certainty | undefined): string {
  if (c === "family_account") return COPY.certainty.familyAccount;
  if (c === "uncertain") return COPY.certainty.uncertain;
  if (c === "disputed") return COPY.certainty.disputed;
  return "";
}

export function period(start: FuzzyDate | undefined, end: FuzzyDate | undefined): string {
  if (start && end) return COPY.dates.span(formatDate(start), formatDate(end));
  if (start) return COPY.dates.from(formatDate(start));
  if (end) return COPY.dates.until(formatDate(end));
  return "";
}
