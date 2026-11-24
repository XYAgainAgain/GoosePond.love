import type { TieFamily, TieKind } from "./records/kinds.ts";
import type { EventKind, InterestRole } from "./records/types.ts";

export const COPY = {
  // Page
  page: {
    title: "GoosePond.love",
    boot: "GoosePond.love",
  },

  // Front Door
  door: {
    title: "GoosePond.love ♥ :)",
    intro: "A sprawling family map. No admittance except on party business.",
    demoNote:
      "This is a demo, so it asks about the Shire instead of the Goose Pond. Spelling and capitals are loosey-goosey.",
    showAnswer: "Show me the answer, please.",
    showPond: "Show me the pond!",
    enter: "Come on in!",
    bothWrong: "Neither of those are correct. Try again!",
    oneWrong: "One of those isn't right. So close!",
    questions: [
      {
        id: "bilbo-home",
        prompt: "What is Bilbo's home called?",
        accept: ["Bag End", "Bag End, Hobbiton", "Bag End under Hill"],
        hint: "Bilbo lives at Bag End.",
      },
      {
        id: "river",
        prompt: "Which river did Frodo's parents drown in?",
        accept: ["Brandywine", "the Brandywine", "Brandywine River", "the Brandywine River"],
        hint: "They drowned in the Brandywine.",
      },
      {
        id: "sam-father",
        prompt: "What is Sam's father usually called?",
        accept: ["the Gaffer", "Gaffer", "Gaffer Gamgee", "the Gaffer Gamgee", "Hamfast"],
        hint: "Sam's father is the Gaffer.",
      },
      {
        id: "great-smials",
        prompt: "Which family lives at Great Smials?",
        accept: ["Took", "Tooks", "the Tooks", "the Took family"],
        hint: "Great Smials is home to the Tooks.",
      },
      {
        id: "merry",
        prompt: "What is Merry's full first name?",
        accept: ["Meriadoc"],
        hint: "Merry is short for Meriadoc.",
      },
      {
        id: "pippin",
        prompt: "What is Pippin's full first name?",
        accept: ["Peregrin"],
        hint: "Pippin is short for Peregrin.",
      },
      {
        id: "sam-wife",
        prompt: "Who did Sam marry?",
        accept: ["Rose Cotton", "Rosie Cotton", "Rose", "Rosie"],
        hint: "Sam married Rose Cotton.",
      },
      {
        id: "party",
        prompt: "Which birthday was Bilbo celebrating at his farewell party?",
        accept: [
          "eleventy-first",
          "his eleventy-first",
          "eleventy-one",
          "111",
          "111th",
          "111st",
          "one hundred and eleventh",
          "hundred and eleventh",
        ],
        hint: "It was his eleventy-first, 111.",
      },
    ],
  },

  // Splash
  splash: {
    painting: "A living painting of the Goose Pond",
    backToCard: "Back to the front door",
    view: "Which view of the pond",
    views: {
      sunset: "Sunset",
      "main-camp": "Main Camp",
      famorama: "Famorama",
      "grassy-knoll": "Grassy Knoll",
    } as Record<string, string>,
    controls: "Pond controls",
    play: "Run the day",
    pause: "Pause the day",
    time: "Time of day in Chatham",
    now: "Back to now",
    weather: "Weather",
    moods: {
      real: "Real weather",
      clear: "Clear",
      fog: "Fog",
      rain: "Rain",
      storm: "Storm",
    },
    fullscreen: "Full screen",
    leaveFullscreen: "Leave full screen",
    caption: (time: string, weather: string, moon: string) =>
      `${time} in Chatham · ${weather} · ${moon}`,
    weatherNow: (sky: string, wind: string, real: boolean) =>
      `${real ? "Right now: " : ""}${sky}, ${wind}`,
    skies: {
      clear: "clear",
      partly: "some clouds",
      overcast: "overcast",
      fog: "fog",
      mist: "mist",
      rain: "rain",
      storm: "thunderstorms",
    },
    calm: "calm",
    wind: (mph: number, point: string) => `wind ${mph} mph from the ${point}`,
    moons: {
      new: "new moon",
      waxingCrescent: "waxing crescent moon",
      firstQuarter: "first quarter moon",
      waxingGibbous: "waxing gibbous moon",
      full: "full moon",
      waningGibbous: "waning gibbous moon",
      lastQuarter: "last quarter moon",
      waningCrescent: "waning crescent moon",
    },
  },

  // Top Bar
  bar: {
    brand: "GoosePond.love ♥",
    badgeDemo: "Demo: Everyone here is fictitious!",
    badgePrivate: "Your family file, kept on this device",
    arrangement: "Arrangement",
    network: "Network",
    generations: "Generations",
    ties: "Ties",
    places: "Places",
    file: "Family File",
    dev: "Dev",
    map: "Family Map",
    close: "×",
    closePanel: "Close Panel",
    more: "More",
    sheet: "Panel height",
  },

  // Settings Tray
  settings: {
    gear: "Settings: theme, text size, and font",
    tray: "Settings",
    themeGroup: "Color theme",
    themes: {
      ember: { label: "Ember", long: "Ember theme" },
      light: { label: "Light", long: "Light theme" },
      blackout: { label: "Blackout", long: "Blackout theme" },
    },
    textGroup: "Text size and font",
    smaller: "Decrease text size",
    larger: "Increase text size",
    reset: "Reset text size",
    resetTo: (size: string) => `Reset text size to ${size.toLowerCase()}`,
    sizes: {
      xsmall: { label: "XS", name: "Extra small" },
      small: { label: "S", name: "Small" },
      medium: { label: "M", name: "Medium" },
      large: { label: "L", name: "Large" },
      xlarge: { label: "XL", name: "Extra large" },
    },
    sizeSaid: (size: string) => `${size} text size`,
    faceButton: "Tt",
    switchFace: (face: string) => `Switch to ${face} font`,
    faceSaid: (face: string) => `${face} font`,
    faces: { "national-park": "National Park", figtree: "Figtree" },
    pond: "Visit the pond",
  },

  // Search
  search: {
    placeholder: "Find someone",
    label: "Find someone",
  },

  // Notices
  notice: {
    showing: (lit: number, total: number, name: string) =>
      `Showing ${lit} of ${total} people around ${name}.`,
    showEveryone: "Show everyone",
    hiddenLines: (names: string) => `Hidden lines: ${names}.`,
    showAllLines: "Show all lines",
    backup: (n: number) => `${n} changes since you last saved a copy.`,
    backupSave: "Save a copy",
    backupLater: "Later",
    pairing: (name: string) => `Now pick someone to connect with ${name}.`,
    pairCancel: "Cancel",
    connected: (to: string, from: string, relation: string) => `${to} is ${from}'s ${relation}.`,
    notConnected: (a: string, b: string) => `No chain of ties links ${a} and ${b}.`,
    clearPath: "Clear",
  },

  // Saved Changes and Undo
  changes: {
    added: (name: string) => `Added ${name}.`,
    removed: (name: string) => `Removed ${name}.`,
    tied: (a: string, b: string) => `Tied ${a} and ${b}.`,
    untied: (a: string, b: string) => `Untied ${a} and ${b}.`,
    tieUpdated: (a: string, b: string) => `Updated the tie between ${a} and ${b}.`,
    updated: (name: string) => `Updated ${name}.`,
    home: (name: string) => `The map now opens on ${name}.`,
    generic: "Saved your change.",
    someone: "someone",
    undo: "Undo",
    undone: (what: string) => `Undid: ${what}`,
    historyTitle: "Changes this session",
    undoLatest: "Undo the latest change",
  },

  // Person Panel
  person: {
    missing: "That person isn't in this family file.",
    notOnRecord: "Someone not on record",
    born: (date: string) => `Born ${date}`,
    died: (date: string) => `Died ${date}`,
    datesUnknown: "Dates Unknown",
    living: "Living",
    bornAs: (name: string) => `Born as ${name}`,
    alsoKnownAs: (names: string[]) => `Also known as ${names.join(", ")}`,
    centerOnMap: "Center on Map",
    edit: "Edit",
    dimOthers: "Dim Everyone Else",
    howFar: "How far to show",
    closeFamily: "Close Family",
    twoSteps: "Two Steps Out",
    ancestors: "Ancestors",
    descendants: "Descendants",
    bothLines: "Both Lines",
    showHow: "Show how on the map",
    thatsMe: "That's me!",
    connect: "Find a Connection",
    shares: (parents: string[]) =>
      `shares ${parents.length === 1 ? "one parent" : `${parents.length} parents`}: ${
        parents.join(", ")
      }`,
    with: (names: string[]) => `with ${names.join(", ")}`,
    at: (place: string) => `at ${place}`,
    placeNotOnRecord: "a place not on record",
    stripLabel: (name: string) => `${name}'s closest family`,
    stripParents: "Parents",
    stripPartners: "Partners",
    stripChildren: "Children",
    photoToCome: "Photo to Come",
    scanToCome: "Scan to Come",
    from: (who: string) => `from ${who}`,
    familyAndTies: "Family and ties",
    siblings: "Siblings",
    siblingsNote: "Worked out from shared parents (not recorded).",
    lifeEvents: "Life Events",
    property: "Property",
    photos: "Photos & Documents",
    accounts: "Differing Accounts",
    sources: "Sources",
  },

  // Editor: Person Form
  editor: {
    addTitle: "Add someone",
    editTitle: (name: string) => `Edit ${name}`,
    name: "Name",
    born: "Born",
    bornPlaceholder: "1950, about 1950, April 3, 1950",
    bornHint: "As loose as you like: a year, month + year, or a full date.",
    livingNudge: "For a living relative, the year is sufficient.",
    died: "Died",
    diedHint: "Leave empty if they're living or you don't know.",
    living: "Living",
    notRecorded: "Not recorded",
    isLiving: "Living",
    hasDied: "Has died",
    pronouns: "Pronouns",
    birthName: "Name at birth",
    birthNameHint: "If different. Usually left out for living people.",
    surname: "Family name at birth",
    surnameHint:
      "Sets their branch color. Leave empty to use the last word of their name at birth.",
    badge: "Mark",
    badgeHint: "A symbol shown before their name on the map, like ♛, ♪, or ★.",
    bio: "A few words about them",
    portrait: "Portrait",
    choosePhoto: "Choose an image",
    removePhoto: "Remove image",
    photoNote: "The image is shrunk and kept in the family file on this device.",
    photoUnreadable: "That file couldn't be read. Try another.",
    home: "Open the map on this person",
    save: "Save",
    add: "Add",
    cancel: "Cancel",
    remove: "Remove this person",
    reallyRemove: (name: string) => `Really remove ${name} and their ties?`,
    unreadableDate: (birth: boolean) =>
      `Couldn't read the ${birth ? "birth" : "death"} date. Try a year.`,
    diesBeforeBorn: "Time traveler detected! Check those dates.",
    saveFailed: "Save failed. Try again, please!",
  },

  // Editor: Changing Ties
  relatives: {
    title: "Change ties",
    notOnRecord: "someone not on record",
    remove: "Remove",
    removeLabel: (name: string | undefined) => `Remove the tie to ${name ?? "this person"}`,
    personOption: (name: string, years: string) => years ? `${name} (${years})` : name,
    twinOption: (name: string, years: string, n: number) =>
      `${name} (${years || "no dates"}, ${n})`,
    addOf: (name: string) => `Add ${name}'s`,
    who: "Who",
    whoPlaceholder: "Pick someone, or type a new name",
    addTie: "Add this tie",
    pickFirst: "Pick someone or type a name first.",
    addFailed: "That tie couldn't be added, sorry!",
    quickGroup: "Add a relative",
    quick: { parent: "+ Parent", partner: "+ Partner", child: "+ Child", sibling: "+ Sibling" },
    quickName: (relative: string) => `New ${relative}'s name`,
    quickNouns: { parent: "parent", partner: "partner", child: "child", sibling: "sibling" },
    quickBorn: "Birth year, if you know it",
    quickAdd: (relative: string) => `Add this ${relative}`,
    moreKinds: "Something else",
  },

  // Family File Panel
  file: {
    title: "Your family file",
    defaultTitle: "Family file",
    intro: "Build your own branch here: add people, tie them together, give them faces.",
    promise:
      "A family file lives in this browser on this device. It's never uploaded anywhere, and nobody else can see it unless you send them a copy.",
    startWith: "Start with one person",
    firstPlaceholder: "Your name, or whoever you'd start with",
    start: "Start a family file",
    alreadyHave: "Already have one?",
    open: "Open a family file",
    openDifferent: "Open a different file",
    count: (n: number) => `${n} ${n === 1 ? "person" : "people"} so far.`,
    shown: "Family shown",
    ours: "Our family",
    demo: "Demo family",
    addPerson: "Add a person",
    saveCopy: "Save a copy",
    saveNote: "Save a copy to back the file up or to send your branch to the family's keeper.",
    forget: "Forget this file",
    reallyForget: "Really forget it? Save a copy first.",
    saveBlocked: "This browser wouldn't save the change. Private browsing can block it.",
    alreadyHeld: "This browser already has a family file, so a new one wasn't started.",
    opened: (people: number, errors: number) =>
      `Opened ${people} people` + (errors ? `, with ${errors} problems to fix in the file.` : "."),
    unreadable: "That file couldn't be read, sorry.",
    forgotten: "The family file is gone from this browser.",
    damaged: "The family file in this browser can't be read. Save a copy to rescue it.",
  },

  // Ties Panel
  legend: {
    title: "Kinds of Tie",
    note: "Untick a kind of tie to hide its lines. Nobody will be removed from the map.",
  },

  // Map Key
  key: {
    title: "Key",
    lines: "Lines",
    families: "Families",
    noFamilies: "No family names yet.",
  },

  // First Visit
  tips: {
    text:
      "Click/tap someone to see who they are. Scroll/pinch to zoom, and click/press and hold on anyone for more options.",
    dismiss: "Got it!",
  },

  // Press-and-Hold Menu
  radial: {
    title: (name: string) => `What to do with ${name}`,
  },

  // Photo Viewer
  lightbox: {
    close: "Close",
    previous: "Previous photo",
    next: "Next photo",
    zoomGroup: "Zoom",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fit: "Fit",
    reset: "Reset",
    resetLabel: "Reset zoom",
    zoomLevel: (times: string, actualSize: boolean) => actualSize ? `${times}× (1:1)` : `${times}×`,
    counter: (n: number, total: number) => `${n} / ${total}`,
    status: (title: string, n: number, total: number) =>
      total > 1 ? `${title}, photo ${n} of ${total}` : title,
    hint: "Scroll to zoom, drag to pan, double-click to reset",
    hintNav: " · → next, ← previous",
    hintNavLetters: " · D or → next, A or ← previous",
    loadFailed: "Sorry, this photo couldn't be loaded.",
    loadFailedStatus: "Sorry, this photo could not be loaded.",
    retry: "Try again",
  },

  // Kinship
  kinship: {
    parent: { they: "parent", he: "father", she: "mother" },
    child: { they: "child", he: "son", she: "daughter" },
    sibling: { they: "sibling", he: "brother", she: "sister" },
    auntOrUncle: { he: "uncle", she: "aunt" },
    nieceOrNephew: { he: "nephew", she: "niece" },
    spouse: { they: "spouse", he: "husband", she: "wife" },
    partner: { they: "partner", he: "partner", she: "partner" },
    either: (first: string, second: string) => `${first} or ${second}`,
    guardian: "guardian",
    ward: "ward",
    donor: "donor",
    carrier: "gestational carrier",
    carried: "child they carried",
    chosen: "chosen family",
    household: "household member",
    connection: "connection",
    ordinals: [
      "first",
      "second",
      "third",
      "fourth",
      "fifth",
      "sixth",
      "seventh",
      "eighth",
      "ninth",
      "tenth",
    ],
    ordinal: (n: number) =>
      `${n}${(Math.floor(n / 10) % 10 !== 1 && ["th", "st", "nd", "rd"][n % 10]) || "th"}`,
    cousin: (ordinal: string) => `${ordinal} cousin`,
    once: "once",
    twice: "twice",
    times: (n: number) => `${n} times`,
    removed: (cousin: string, times: string) => `${cousin} ${times} removed`,
    great: (noun: string) => `great-${noun}`,
    grand: (noun: string) => `grand${noun}`,
    half: (noun: string) => `half-${noun}`,
    step: (noun: string) =>
      /^(mother|father|son|daughter|brother|sister|child)$/.test(noun)
        ? `step${noun}`
        : `step-${noun}`,
    inLaw: (noun: string) => `${noun}-in-law`,
    former: (noun: string) => `former ${noun}`,
    adoptive: (noun: string) => `adoptive ${noun}`,
    adopted: (noun: string) => `adopted ${noun}`,
    birth: (noun: string) => `birth ${noun}`,
    foster: (noun: string) => `foster ${noun}`,
    donorConceived: (noun: string) => `donor-conceived ${noun}`,
    twin: (noun: string) => `twin ${noun}`,
    identicalTwin: (noun: string) => `identical twin ${noun}`,
    byCustom: (noun: string) => `${noun} by custom`,
    chain: (relations: string[]) => relations.join("'s "),
    you: "you",
    your: (relation: string) => `your ${relation}`,
  },

  // Saving a Picture
  picture: {
    thisView: "Save this view as a picture",
    wholeMap: "Save the whole map as a picture",
    made: (day: string) => `Made ${day}`,
    file: (day: string) => `goosepond-map-${day}.png`,
    failed: "The picture couldn't be made, sorry.",
  },

  // Place Panel
  place: {
    title: "Places",
    none: "This family file has no places yet.",
    holderNotOnRecord: "a holder not on record",
    alsoCalled: (names: string[]) => `Also called ${names.join(", ")}`,
    heldRole: "Who has held a role here",
    happened: "What happened here",
    rolesNote: "Roles are listed as documents state them.",
    ring: "Mark on Map",
    bodies: "Trusts and Other Bodies",
    otherPlaces: "Other Places",
  },

  // Dates
  dates: {
    unknown: "unknown",
    eventUnknown: "date unknown",
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    month: (month: string, year: number) => `${month} ${year}`,
    day: (month: string, day: number, year: number) => `${month} ${day}, ${year}`,
    about: (date: string) => `about ${date}`,
    between: (first: string, last: string) => `between ${first} and ${last}`,
    span: (start: string, end: string) => `${start} to ${end}`,
    from: (start: string) => `from ${start}`,
    until: (end: string) => `until ${end}`,
    lifespan: (born: string, died: string) => `${born}–${died}`,
    bornYear: (year: string) => `b. ${year}`,
    diedYear: (year: string) => `d. ${year}`,
    roughYear: (year: string) => `~${year}`,
  },

  // Kinds of Tie
  kinds: {
    biological_parent: {
      label: "Biological parent",
      fromRole: "biological parent",
      toRole: "biological child",
    },
    adoptive_parent: {
      label: "Adoptive parent",
      fromRole: "adoptive parent",
      toRole: "adopted child",
    },
    legal_parent: { label: "Legal parent", fromRole: "legal parent", toRole: "child (legal)" },
    intended_parent: {
      label: "Intended parent",
      fromRole: "intended parent",
      toRole: "child (intended)",
    },
    step_parent: { label: "Step-parent", fromRole: "step-parent", toRole: "stepchild" },
    foster_parent: { label: "Foster parent", fromRole: "foster parent", toRole: "foster child" },
    guardian: { label: "Guardian", fromRole: "guardian", toRole: "ward" },
    gamete_donor: { label: "Donor", fromRole: "donor", toRole: "donor-conceived child" },
    gestational_carrier: {
      label: "Gestational carrier",
      fromRole: "gestational carrier",
      toRole: "child carried",
    },
    spouse: { label: "Spouse", fromRole: "spouse", toRole: "spouse" },
    partner: { label: "Partner", fromRole: "partner", toRole: "partner" },
    chosen_family: { label: "Chosen family", fromRole: "chosen family", toRole: "chosen family" },
    sibling_by_custom: {
      label: "Sibling by custom",
      fromRole: "sibling by custom",
      toRole: "sibling by custom",
    },
    incorporated_into_household: {
      label: "Joined the household",
      fromRole: "household they joined",
      toRole: "joined their household",
    },
    twin: { label: "Twin", fromRole: "twin", toRole: "twin" },
    identical_twin: {
      label: "Identical twin",
      fromRole: "identical twin",
      toRole: "identical twin",
    },
    other: { label: "Connection", fromRole: "connection", toRole: "connection" },
  } satisfies Record<TieKind, { label: string; fromRole: string; toRole: string }>,

  // Families of Tie
  families: {
    lineage: "Biological",
    legal: "Legal and adoptive",
    care: "Step, foster, and guardian",
    assisted: "Donor",
    partnership: "Partnership",
    chosen: "Chosen family",
    other: "Other",
  } satisfies Record<TieFamily, string>,

  // Map
  map: {
    bornTogether: (n: number) => n === 2 ? "Twins" : n === 3 ? "Triplets" : `${n} born together`,
    bornSpan: (from: number, to: number) => from === to ? `born ${from}` : `born ${from}–${to}`,
    ringAway: (ties: number) => ties === 1 ? "1 tie away" : `${ties} ties away`,
    ringApart: "Not tied in",
  },

  // Events
  events: {
    labels: {
      birth: "Born",
      death: "Died",
      marriage: "Married",
      divorce: "Divorced",
      separation: "Separated",
      partnership: "Partnership began",
      adoption: "Adoption",
      fostering: "Fostered",
      residence: "Lived",
      immigration: "Immigrated",
      property_transfer: "Property transfer",
      reunion: "Reunion",
      other: "Event",
    } satisfies Record<EventKind, string>,
    fallback: "Event",
  },

  // Property Roles
  roles: {
    labels: {
      trustee: "Trustee",
      beneficiary: "Beneficiary",
      recorded_owner: "Recorded owner",
      stakeholder: "Stakeholder",
      caretaker: "Caretaker",
      other: "Other role",
    } satisfies Record<InterestRole, string>,
    fallback: "Role",
    share: (share: string) => `share as documented: ${share}`,
  },

  // Certainty
  certainty: {
    familyAccount: "family account",
    uncertain: "uncertain",
    disputed: "disputed",
  },

  // Things That Go Wrong
  errors: {
    dateNames: { birth: "birth", death: "death", start: "start", end: "end" },
    badDate: (what: string, text: string) => `The ${what} date "${text}" can't be read.`,
    personMissing: "That person isn't in this family file.",
    needsName: "A person needs a name. Usually, at least.",
    unknownKind: "That kind of tie isn't one this family file has yet.",
    selfTie: "A person can't be tied to themselves. Not on here, at least.",
    duplicateTie: (kind: string) => `These two people already have a ${kind} tie.`,
    tieMissing: "That tie isn't in this family file.",
    notVersion1: 'This file is not a family file: it needs "version": 1 at the top.',
    notList: (list: string) => `"${list}" should be a list.`,
    notRecord: (entry: number, list: string) => `Entry ${entry} in "${list}" isn't a record.`,
    missingField: (entry: number, list: string, key: string) =>
      `Entry ${entry} in "${list}" is missing its "${key}".`,
    notJson: "That file isn't a family file; it couldn't be read as JSON.",
    noParents: "Siblings share parents, so add a parent first.",
  },

  // Record Checks
  checks: {
    refNames: {
      person: "person",
      media: "media item",
      source: "source",
      place: "place",
      holder: "person or entity",
      record: "record",
    },
    duplicateId: (id: string) => `Two records share the ID ${id}`,
    dangling: (owner: string, what: string, target: string) =>
      `${owner} points at a missing ${what}: ${target}`,
    badDate: (owner: string, date: string) => `${owner} has a date that can't be read: ${date}`,
    endsBeforeStarts: (owner: string) => `${owner} ends before it starts`,
    selfTie: (id: string) => `${id} ties a person to themselves`,
    unknownKind: (id: string, kind: string) => `${id} has an unknown kind: ${kind}`,
    diesBeforeBorn: (name: string) => `${name} has a death date before their birth date`,
    bornBeforeParent: (name: string) => `${name} is recorded as born before a biological parent`,
    bornAfterParentsDied: (name: string) =>
      `${name} is recorded as born more than a year after every biological parent on record died`,
  },

  // Dev Panel
  dev: {
    title: "Dev Panel",
    familyShown: "Family shown",
    family: "Family",
    shire: "The Shire", // lmao
    generated: "Generated Family",
    fixture: "Hand-Written Hard Cases",
    private: "Your Family File",
    size: "Size",
    people: (n: number) => `${n.toLocaleString("en-US")} people`,
    seed: "Seed",
    newSeed: "New Seed",
    drawing: "Drawing",
    portraits: "Portraits",
    webgl: "WebGL Preview (dashed lines become solid)",
    lightCanvas: "Lighter Drawing (1.5× pixels at most)",
    rerun: "Re-run Layout",
    fit: "Fit to Screen",
    measure: "Measure Movement",
    frontDoor: "Front Door",
    lock: "Lock the Door",
    version: (build: string, offline: boolean) =>
      `Build ${build} · ${offline ? "works offline" : "online only"}`,
    arranging: (people: number) => `Arranging ${people} people…`,
    counts: (people: number, ties: number) => `${people} people, ${ties} ties`,
    arranged: (network: boolean, ms: number, webgl: boolean) =>
      `${network ? "Network" : "Generations"} arranged in ${Math.round(ms)} ms` +
      (webgl ? " · WebGL preview" : ""),
    checks: (errors: number, warnings: number, looped: boolean) =>
      `Record checks: ${errors} errors, ${warnings} warnings` +
      (looped ? " · descent ties loop, so rows are an estimate" : ""),
    measuring: "Measuring movement for 3 seconds…",
    movement: (webgl: boolean, view: string, median: number, p95: number, worst: number) =>
      `Movement (${webgl ? "WebGL" : "canvas"}, ${view}): median ${
        median.toFixed(1)
      } ms a frame, 95th percentile ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`,
    fps: (fps: number, slowest: number) =>
      `${Math.round(fps)} FPS · slowest recent frame ${Math.round(slowest)} ms`,
  },

  // Pond Tuning Panel
  pondPanel: {
    title: "Pixel Pond",
    fullscreen: "Full screen",
    fullscreenRefused: "The browser refused full screen.",
    fullscreenMissing:
      "This browser can't go full screen. On iPhone, Share → Add to Home Screen opens it without the browser bars.",
    reset: "Reset all",
    clock: "Clock",
    speeds: {
      live: "Live",
      paused: "Paused",
      minute: "1 min/s",
      ten: "10 min/s",
      hour: "1 hr/s",
      day: "1 day/min",
    },
    tabsLabel: "Control groups",
    tabs: {
      time: "Time",
      view: "View",
      weather: "Weather",
      clouds: "Clouds",
      light: "Light",
      look: "Look",
      debug: "Debug",
    },
    date: "Date",
    time: "Time",
    now: "Now",
    nextEclipse: "Next eclipse",
    view: "View",
    heading: "Heading",
    span: "Span",
    horizon: "Horizon",
    pan: "Pan",
    parallax: "Parallax",
    tilt: "Tilt to look",
    scale: "Pixel size",
    scaleAuto: "Auto",
    weather: "Weather",
    weatherModes: { manual: "Manual", forecast: "Forecast", live: "Live" },
    liveCredit: "Weather data by Open-Meteo.com",
    presets: {
      fair: "Fair",
      overcast: "Overcast",
      mackerel: "Mackerel sunset",
      storm: "Storm breaking",
      thunder: "Thunder",
    },
    strike: "Strike",
    storms: "Storms",
    rain: "Rain",
    fog: "Fog",
    mist: "Mist",
    mistStyle: "Mist style",
    mistStyles: { auto: "Auto", blanket: "Blanket", wisps: "Wisps", steam: "Steam" },
    wind: "Wind",
    windFrom: "Wind from",
    foliage: "Tree sway",
    drift: "Cloud speed",
    low: "Low",
    mid: "Mid",
    cirrus: "Cirrus",
    cover: "Cover",
    base: "Base",
    softness: "Softness",
    density: "Density",
    billows: "Billows",
    size: "Size",
    shading: "Shading",
    opacity: "Opacity",
    curl: "Curl",
    width: "Width",
    puffiness: "Puffiness",
    cirrusHeading: "Heading",
    lighthouse: "Lighthouse",
    beam: "Beam",
    beamSpread: "Beam spread",
    landFill: "Land fill",
    shadowScale: "Shadow scale",
    reflection: "Reflection",
    glitter: "Glitter",
    rim: "Rim light",
    grade: "Warm grade",
    exposure: "Exposure",
    disc: "Disc size",
    stars: "Stars",
    milky: "Milky Way",
    dither: "Dither",
    dithers: { "1": "2×2", "2": "4×4", "3": "8×8", "0": "None, smooth" } as Record<string, string>,
    levels: "Levels",
    seed: "Seed",
    frameCap: "Frame cap",
    cap: (fps: number) => fps >= 1000 ? "Uncapped" : `${fps} FPS`,
    showShadow: "Show cloud shadows",
    showDepth: "Show depth map",
    km: (n: number) => `${n} km`,
    units: { degrees: "°", percent: "%", times: "×", speed: " m/s", meters: " m" },
  },

  // Pond Readouts, Shown in the Tuning Panel
  pond: {
    clock: (hour: number, minute: string, morning: boolean) =>
      `${hour}:${minute} ${morning ? "AM" : "PM"}`,
    fps: (fps: number) => `${fps} FPS`,
    readout: (
      sunAz: number,
      sunEl: string,
      moonAz: number,
      moonEl: string,
      lit: number,
      stars: number,
      magnitude: string,
    ) =>
      `Sun ${sunAz}° ${sunEl} · Moon ${moonAz}° ${moonEl}, ${lit}% lit · ${stars} stars to mag ${magnitude}`,
    readoutEclipse: (moonlight: number) => ` · eclipse, moonlight ${moonlight}%`,
    eclipse: (type: string, magnitude: string, degrees: number) =>
      `${type} eclipse, umbral magnitude ${magnitude}, moon ${degrees}° up.`,
    noEclipse: "No visible eclipse ahead before 2100.",
    liveNeedsClock: "Live weather needs the Live clock, using the forecast",
    frontPassing: "Front passing",
    frontMinutes: (minutes: number) => `Front in ${minutes} min`,
    frontHours: (hours: number) => `Front in ${hours} h`,
    noFront: "No front nearby",
    forecast: (front: string, air: string, water: string, wind: string) =>
      `${front} · air ${air} · water ${water} · ${wind}`,
    temperature: (f: number, c: number) => `${f} °F (${c} °C)`,
    wind: (mph: number, ms: number) => `wind ${mph} mph (${ms} m/s)`,
    windFrom: (speed: string, degrees: number, point: string) =>
      `${speed} from ${degrees}° (${point})`,
    compass: "N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW".split(" "),
    live: {
      outside: "Live data does not cover this time, using the forecast",
      unavailable: "Live data unavailable, using the forecast",
      fading: "Live data fading to forecast",
      last: "Last live data",
      live: "Live",
      updated: (source: string, minutes: number) => `${source} · updated ${minutes} min ago`,
    },
    tilt: {
      insecure: "Tilt needs the page on https or localhost.",
      noSensors: "This browser has no motion sensors.",
      refused: "Motion access was turned down.",
      silent: "No motion sensor is reporting.",
    },
    debug: {
      frame: (frame: string, script: string) => `Frame ${frame} ms, script ${script} ms`,
      canvas: (width: number, height: number, scale: number) =>
        `Canvas ${width}×${height} art px at ${scale}×`,
      gpu: (gpu: string) => `GPU ${gpu}`,
      view: (name: string, width: number, depth: boolean, fore: boolean, foliage: boolean) => {
        const yes = (on: boolean) => on ? "yes" : "no";
        return `View ${name}: ${width} px wide, depth ${yes(depth)}, foreground ${
          yes(fore)
        }, foliage mask ${yes(foliage)}`;
      },
      storms: (live: number, near: number, strikes: number) =>
        `Storms ${live} striking of ${near} within 90 km, ${strikes} strikes`,
      beaconAverage: "Lighthouse · full-turn average",
      beacon: (angles: string[], next: string) =>
        `Lighthouse ${angles.join(" / ")} · next pass ${next} s`,
      eye: (meters: string[]) => `Eye offset ${meters.join(", ")} m`,
      noRainFront: "Rain front —",
      rainFront: (meters: number) => `Rain front ${meters} m`,
      rainPassing: "Rain front passing",
    },
  },
};
