import { archiveBuilder } from "../records/builder.ts";
import type { Archive, Certainty, FuzzyDate, Id, InterestRole } from "../records/types.ts";

export function fixture(): Archive {
  const b = archiveBuilder("The Marlow and Sarn families (invented)", true);
  const { person: P, tie: T, parents, event: E } = b;
  const a = b.archive;

  const married = (x: Id, y: Id, start: FuzzyDate, end?: FuzzyDate) => {
    E("marriage", [x, y], { date: start });
    return T("spouse", x, y, { start, end });
  };
  const birthOf = (pid: Id) => a.events.find((e) => e.kind === "birth" && e.people[0] === pid)!.id;

  const place = (name: string, note: string) => {
    const id = b.id("pl");
    a.places.push({ id, name, note });
    return id;
  };
  const source = (
    title: string,
    extra: { citation?: string; providedBy?: string; obtained?: string } = {},
  ) => {
    const id = b.id("s");
    a.sources.push({ id, title, ...extra });
    return id;
  };

  const harlow = place("Harlow Mills", "The town nearest the lake.");
  const lake = place("Lake Wendell", "The lake the landing sits on.");
  const landing = place(
    "Tamarack Landing",
    "Four cabins on Lake Wendell. The canoe is Marigold, the boathouse door is green, and the youngest person present rings the dinner bell.",
  );
  place("Sawmill", "The largest cabin, with the main room and a heron carved over the fireplace.");
  place("Lantern", "A cabin at Tamarack Landing.");
  place("Wren", "The smallest cabin.");
  place("The Annex", "A cabin at Tamarack Landing.");

  const trust = b.id("en");
  a.entities.push({ id: trust, name: "Tamarack Landing Family Trust", kind: "trust" });

  const deed = source("Deed of trust, Tamarack Landing Family Trust", {
    citation: "Harlow Mills land registry, book 12, page 40",
    obtained: "2018",
  });
  const restatement = source("Restatement of the trust", {
    citation: "Signed copy kept in Sawmill",
  });
  const bible = source("Marlow family Bible", { providedBy: "Cora Marlow", obtained: "2019-07" });
  const card = source("Enlistment card", { citation: "County service records, box 7" });
  const interview = source("Recorded conversation about the early years", {
    providedBy: "Iris Marlow-Reyes",
    obtained: "2021-07-12",
  });

  // Several generations: the Marlow line
  const aldous = P("Aldous Marlow", {
    badge: "♛",
    born: "1888/1892",
    died: "1950",
    living: false,
    bio: "Bought the land at Tamarack Landing and built Sawmill with his brothers-in-law.",
  });
  const rosalind = P("Rosalind Marlow", {
    birthName: "Rosalind Kettering",
    born: "1893~",
    died: "1962-02",
    living: false,
    bio: "Kept the landing's ledgers for forty years.",
  });
  married(aldous, rosalind, "1914", "1950");

  // Disputed birth year, recorded as two claims
  const bram = P("Bram Marlow", {
    born: "1919~",
    died: "1988-11-03",
    living: false,
    bio: "Ran the boathouse and painted its door every spring.",
  });
  parents("biological_parent", bram, aldous, rosalind);
  for (
    const [statement, sources] of [
      ["Born in 1919, as written in the family Bible.", [bible]],
      ["Born in 1921, as written on his enlistment card.", [card]],
    ] as const
  ) {
    a.claims.push({
      id: b.id("c"),
      about: birthOf(bram),
      statement,
      certainty: "disputed",
      sources: [...sources],
    });
  }

  // Widowhood, then remarriage
  const ada = P("Ada Marlow", {
    birthName: "Ada Fennimore",
    born: "1921-03-14",
    died: "2009-01-30",
    living: false,
    pronouns: "she/her",
    bio: "Started the Lantern Swim tradition and swam it until she was eighty.",
  });
  married(ada, bram, "1942-06", "1988-11-03");
  const theda = P("Theda Penn", { born: "1920", died: "1985", living: false });
  const hollis = P("Hollis Penn", {
    born: "1918",
    died: "2001-05",
    living: false,
    bio: "A widower who met Ada at the Harlow Mills library.",
  });
  married(hollis, theda, "1943", "1985");
  married(ada, hollis, "1993-08", "2001-05");
  const jude = P("Jude Penn", { born: "1945", living: true, bio: "A carpenter in Harlow Mills." });
  parents("biological_parent", jude, hollis, theda);

  const cora = P("Cora Marlow", {
    born: "1946",
    living: true,
    pronouns: "she/her",
    bio: "Current trustee. Keeps the family Bible and most of the stories.",
  });
  const dell = P("Dell Marlow", {
    born: "1949-08",
    living: true,
    pronouns: "he/him",
    bio: "Taught woodworking and rebuilt Marigold twice.",
  });
  const enid = P("Enid Marlow", {
    born: "1955-02-11",
    living: true,
    bio: "A nurse who never misses the Lantern Swim.",
  });
  for (const k of [cora, dell, enid]) parents("biological_parent", k, ada, bram);

  // Foster placement, with the one known birth parent kept
  const sol = P("Sol Tolland", { born: "1930", died: "1971", living: false });
  const rex = P("Rex Tolland", {
    born: "1952",
    living: true,
    bio: "Came to the Marlows as a foster child and later looked after the cabins.",
  });
  parents("biological_parent", rex, sol);
  for (const f of [ada, bram]) T("foster_parent", f, rex, { start: "1958", end: "1963" });
  E("fostering", [rex, ada, bram], { date: "1958", place: harlow });
  T("sibling_by_custom", rex, cora, { note: "Grew up as brother and sister." });

  // Chosen family linking a second branch
  const vic = P("Vic Okafor", {
    born: "1920",
    died: "1999",
    living: false,
    bio: "Bram's closest friend from boyhood; came to Harlow Mills as a young man.",
  });
  E("immigration", [vic], { date: "1937~", place: harlow });
  T("chosen_family", bram, vic, { start: "1938" });
  const ines = P("Ines Okafor", { born: "1924", died: "2015", living: false });
  married(vic, ines, "1946", "1999");
  const uma = P("Uma Okafor", {
    born: "1950",
    living: true,
    bio: "A surveyor who mapped the lakeshore.",
  });
  parents("biological_parent", uma, vic, ines);

  // Divorce, a same-gender couple tied twice, and a stepfamily with four parent figures
  const finn = P("Finn Arbour", {
    born: "1944",
    living: true,
    bio: "Sails the lake in any weather.",
  });
  married(cora, finn, "1966", "1974");
  E("divorce", [cora, finn], { date: "1974" });
  const gil = P("Gil Arbour", {
    born: "1968",
    living: true,
    bio: "Co-trustee who handles repairs at the landing.",
  });
  parents("biological_parent", gil, cora, finn);
  married(finn, uma, "1975");
  T("step_parent", uma, gil, { start: "1975" });
  const tess = P("Tess Arbour", {
    born: "1975-11",
    living: true,
    bio: "Plays the fiddle at reunions.",
  });
  parents("biological_parent", tess, finn, uma);

  const hana = P("Hana Reyes", {
    born: "1948",
    living: true,
    pronouns: "she/her",
    bio: "Cora's partner since the seventies.",
  });
  T("partner", cora, hana, { start: "1976", end: "2004" });
  E("partnership", [cora, hana], { date: "1976" });
  married(cora, hana, "2004");
  T("step_parent", hana, gil, { start: "1976" });

  // Unknown other parent
  const xan = P("Xan Reyes", {
    born: "1970",
    living: true,
    bio: "Runs a print shop in Harlow Mills.",
  });
  parents("biological_parent", xan, hana);

  // Donor conception with adoption by the second parent
  const iris = P("Iris Marlow-Reyes", {
    born: "1979",
    living: true,
    bio: "Records family stories and keeps the sources in order.",
  });
  parents("biological_parent", iris, cora);
  parents("gamete_donor", iris, jude);
  T("adoptive_parent", hana, iris, { start: "1981" });
  E("adoption", [iris, hana], { date: "1981" });

  // Biological and adoptive parents, both kept
  const lev = P("Lev Marlow", {
    birthName: "Lev Danner",
    born: "1950",
    living: true,
    pronouns: "he/him",
  });
  T("partner", dell, lev, { start: "1971" });
  const mara = P("Mara Quist", {
    born: "1955",
    living: true,
    bio: "Kit's birth mother, in touch since 1995.",
  });
  const kit = P("Kit Marlow", { born: "1974", living: true, bio: "Grew up in Wren every summer." });
  parents("biological_parent", kit, mara);
  for (const p of [dell, lev]) T("adoptive_parent", p, kit, { start: "1976" });
  E("adoption", [kit, dell, lev], { date: "1976", sources: [interview] });

  // Double-donor IVF: two legal parents, two donors, one undisclosed
  const quin = P("Quin Abara", {
    born: "1953",
    living: true,
    bio: "A piano tuner who still visits Nell.",
  });
  T("partner", enid, quin, { start: "1984", end: "2003" });
  E("separation", [enid, quin], { date: "2003" });
  const otis = P("Otis Hale", { born: "1950" });
  const undisclosed = P("Undisclosed donor");
  const nell = P("Nell Marlow-Abara", {
    born: "1990",
    living: true,
    bio: "Studies freshwater birds.",
  });
  parents("legal_parent", nell, enid, quin);
  parents("gamete_donor", nell, otis, undisclosed);

  // Gestational carrier
  const orla = P("Orla Byrne", {
    born: "1970",
    living: true,
    bio: "Cooks for the whole landing in July.",
  });
  married(gil, orla, "1995");
  const rue = P("Rue Castell", {
    born: "1972",
    living: true,
    bio: "Orla's cousin, who carried Wes.",
  });
  const wes = P("Wes Arbour", {
    born: "1999",
    living: true,
    bio: "Rings the dinner bell less often now.",
  });
  parents("biological_parent", wes, gil, orla);
  parents("gestational_carrier", wes, rue);

  // Three-partner household, unmarried co-parents, and guardianship
  const yael = P("Yael Stone", {
    born: "1971",
    living: true,
    bio: "Grows the tomatoes behind The Annex.",
  });
  const zed = P("Zed Moreau", {
    born: "1969",
    living: true,
    pronouns: "they/them",
    bio: "Bea's guardian and the household's bookkeeper.",
  });
  for (const [x, y] of [[xan, yael], [yael, zed], [xan, zed]]) {
    T("partner", x, y, { start: "1994~" });
  }
  const bea = P("Bea Reyes-Stone", {
    born: "1996",
    living: true,
    bio: "Paddles Marigold faster than anyone.",
  });
  parents("biological_parent", bea, xan, yael);
  T("guardian", zed, bea, { start: "1998" });

  // Cross-branch marriage: several paths between the same people
  married(kit, tess, "2000-09-16");
  const noa = P("Noa Marlow", { born: "2003", living: true, bio: "Studying to be a ferry pilot." });
  const lio = P("Lio Marlow", { born: "2007", living: true, bio: "The youngest at most dinners." });
  for (const k of [noa, lio]) parents("biological_parent", k, kit, tess);

  // Parents and dates unknown
  const ivo = P("Ivo Lund");
  T("partner", iris, ivo, { start: "2004" });
  const pax = P("Pax Lund", { born: "2006", living: true });
  parents("biological_parent", pax, iris, ivo);
  // Triplets, two of them identical; a chain of twin ties groups all three
  const [ola, per, siv] = ["Ola Lund", "Per Lund", "Siv Lund"].map((n) =>
    P(n, { born: "2010", living: true })
  );
  for (const k of [ola, per, siv]) parents("biological_parent", k, iris, ivo);
  T("identical_twin", ola, per);
  T("twin", per, siv);

  // A branch unconnected until a marriage
  const dov = P("Dov Sarn", { born: "1898/1902", died: "1961~", living: false });
  const elke = P("Elke Sarn", { born: "1903~", died: "1970-10", living: false });
  married(dov, elke, "1922~", "1961~");
  const gus = P("Gus Sarn", {
    born: "1925",
    died: "2004",
    living: false,
    bio: "Ran the mill store.",
  });
  parents("biological_parent", gus, dov, elke);
  const lisl = P("Lisl Sarn", {
    birthName: "Lisl Harrow",
    born: "1927",
    died: "2019",
    living: false,
  });
  married(gus, lisl, "1950", "2004");
  const mae = P("Mae Sarn", {
    born: "1952",
    living: true,
    bio: "Met Rex at the mill store counter.",
  });
  parents("biological_parent", mae, gus, lisl);
  married(rex, mae, "1975");
  const pip = P("Pip Tolland", { born: "1978", living: true });
  parents("biological_parent", pip, rex, mae);
  // Twins
  const ren = P("Ren Sarn", { born: "1956", living: true });
  const rhea = P("Rhea Sarn", { born: "1956", living: true });
  for (const k of [ren, rhea]) parents("biological_parent", k, gus, lisl);
  T("identical_twin", ren, rhea);

  // Chosen family who joined a household
  const juno = P("Juno Dace", {
    born: "1997",
    living: true,
    bio: "Wes's best friend, at every reunion since 2012.",
  });
  T("chosen_family", wes, juno, { start: "2012" });
  T("incorporated_into_household", orla, juno, { start: "2013" });

  E("residence", [rex, mae], { date: "1980/2010", place: landing });
  E("reunion", [cora, dell, enid, gil, iris, kit, tess, wes, juno, lio], {
    date: "2019-07",
    place: lake,
    note: "The Lantern Swim.",
    sources: [interview],
  });

  // The property, its trust, and roles that change over time
  E("property_transfer", [aldous], { date: "1931", place: landing, sources: [deed] });
  const interest = (
    holder: Id,
    role: InterestRole,
    start?: FuzzyDate,
    end?: FuzzyDate,
    extra: { share?: string; certainty?: Certainty; sources?: Id[] } = {},
  ) => a.interests.push({ id: b.id("i"), holder, place: landing, role, start, end, ...extra });
  interest(aldous, "recorded_owner", "1919", "1931", { sources: [deed] });
  interest(trust, "recorded_owner", "1931", undefined, { sources: [deed] });
  interest(aldous, "trustee", "1931", "1950", { sources: [deed] });
  interest(rosalind, "trustee", "1950", "1962-02");
  interest(bram, "trustee", "1962", "1988-11-03", { sources: [restatement] });
  interest(ada, "trustee", "1988", "2005");
  interest(cora, "trustee", "2005");
  interest(gil, "trustee", "2019");
  interest(bram, "beneficiary", "1931", "1988-11-03", { sources: [deed] });
  for (const k of [cora, dell, enid]) {
    interest(k, "beneficiary", "1962", undefined, {
      share: "one third",
      sources: [restatement],
    });
  }
  interest(gil, "beneficiary", "1990");
  interest(kit, "beneficiary", "1995~", undefined, { certainty: "family_account" });
  interest(iris, "beneficiary", "2000");
  interest(rex, "caretaker", "1980", "2010", { certainty: "family_account" });

  const media = (kind: "photo" | "document", title: string, people: Id[], date?: FuzzyDate) =>
    a.media.push({ id: b.id("m"), kind, title, people, date });
  media("photo", "Lantern Swim on the dock", [ada, bram, cora, dell, enid, rex], "1964-07");
  media("photo", "Marigold at the boathouse", [gil, xan], "1985~");
  media("document", "Deed of trust", [aldous], "1931");
  media("photo", "Kit and Tess on their wedding day", [kit, tess], "2000-09-16");
  media("photo", "Dinner in the Sawmill main room", [cora, hana, iris, pax, lio], "2015");

  return a;
}
