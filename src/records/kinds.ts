import { COPY } from "../copy.ts";

export type TieKind =
  | "biological_parent"
  | "adoptive_parent"
  | "legal_parent"
  | "intended_parent"
  | "step_parent"
  | "foster_parent"
  | "guardian"
  | "gamete_donor"
  | "gestational_carrier"
  | "spouse"
  | "partner"
  | "chosen_family"
  | "sibling_by_custom"
  | "incorporated_into_household"
  | "twin"
  | "identical_twin"
  | "other";

export type TieFamily =
  | "lineage"
  | "legal"
  | "care"
  | "assisted"
  | "partnership"
  | "chosen"
  | "other";

export interface KindInfo {
  label: string;
  family: TieFamily;
  /* `from` is the older-generation figure, `to` the child */
  directed: boolean;
  /* Puts `to` a row below `from` in the generations view */
  ranks: boolean;
  /* Keeps both people on one row, seated together */
  pairs: boolean;
  /* How `from` reads on `to`'s page, and the reverse */
  fromRole: string;
  toRole: string;
}

const parent = (kind: TieKind, family: TieFamily): KindInfo => ({
  ...COPY.kinds[kind],
  family,
  directed: true,
  ranks: true,
  pairs: false,
});

const mutual = (kind: TieKind, family: TieFamily, pairs: boolean): KindInfo => ({
  ...COPY.kinds[kind],
  family,
  directed: false,
  ranks: false,
  pairs,
});

export const KINDS: Record<TieKind, KindInfo> = {
  biological_parent: parent("biological_parent", "lineage"),
  adoptive_parent: parent("adoptive_parent", "legal"),
  legal_parent: parent("legal_parent", "legal"),
  intended_parent: parent("intended_parent", "legal"),
  step_parent: parent("step_parent", "care"),
  foster_parent: parent("foster_parent", "care"),
  guardian: parent("guardian", "care"),
  gamete_donor: parent("gamete_donor", "assisted"),
  gestational_carrier: parent("gestational_carrier", "assisted"),
  spouse: mutual("spouse", "partnership", true),
  partner: mutual("partner", "partnership", true),
  chosen_family: mutual("chosen_family", "chosen", false),
  sibling_by_custom: mutual("sibling_by_custom", "chosen", false),
  incorporated_into_household: {
    ...COPY.kinds.incorporated_into_household,
    family: "care",
    directed: true,
    ranks: false,
    pairs: false,
  },
  // Recorded, not derived: living people carry only a birth year
  twin: mutual("twin", "lineage", true),
  identical_twin: mutual("identical_twin", "lineage", true),
  other: mutual("other", "other", false),
};

export const FAMILY_ORDER: TieFamily[] = [
  "lineage",
  "legal",
  "care",
  "assisted",
  "partnership",
  "chosen",
  "other",
];

export const FAMILIES: Record<TieFamily, { label: string }> = {
  lineage: { label: COPY.families.lineage },
  legal: { label: COPY.families.legal },
  care: { label: COPY.families.care },
  assisted: { label: COPY.families.assisted },
  partnership: { label: COPY.families.partnership },
  chosen: { label: COPY.families.chosen },
  other: { label: COPY.families.other },
};

/* Donors and carriers rank for layout but are not parent figures */
export function isParentFigure(kind: TieKind): boolean {
  const k = KINDS[kind];
  return k.ranks && k.family !== "assisted";
}
