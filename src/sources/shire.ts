import { archiveBuilder } from "../records/builder.ts";
import type { Archive, Certainty, FuzzyDate, Id } from "../records/types.ts";

export function shire(): Archive {
  const b = archiveBuilder("The Shire", true);
  const a = b.archive;

  const P = (name: string, born?: number, died?: number | string, aliases?: string[]) =>
    b.person(name, {
      born: born === undefined ? undefined : String(born),
      died: died === undefined ? undefined : String(died),
      aliases,
    });
  const wed = (x: Id, y: Id, start?: FuzzyDate) => b.tie("spouse", x, y, start ? { start } : {});
  const kids = (parents: Id[], ...children: Id[]) => {
    for (const c of children) b.parents("biological_parent", c, ...parents);
  };
  const place = (name: string) => {
    const id = b.id("pl");
    a.places.push({ id, name });
    return id;
  };
  const source = (title: string, citation: string) => {
    const id = b.id("s");
    a.sources.push({ id, title, citation });
    return id;
  };

  const appC = source(
    "The Lord of the Rings, Appendix C: Family Trees",
    "J.R.R. Tolkien; the Bolger and Boffin trees as added in the 50th Anniversary Edition",
  );
  const appB = source("The Lord of the Rings, Appendix B: The Tale of Years", "J.R.R. Tolkien");
  const story = source(
    "The Lord of the Rings",
    "J.R.R. Tolkien; A Long-expected Party, Three is Company, The Scouring of the Shire, The Grey Havens",
  );
  const hobbit = source("The Hobbit, An Unexpected Party", "J.R.R. Tolkien");

  const bagEnd = place("Bag End");
  const brandyHall = place("Brandy Hall");
  place("Great Smials");
  const brandywine = place("Brandywine River");
  const havens = place("Grey Havens");

  // Baggins of Hobbiton
  const balbo = P("Balbo Baggins", 1167, 1258);
  const berylla = P("Berylla Boffin", 1172);
  wed(balbo, berylla);
  const mungo = P("Mungo Baggins", 1207, 1300);
  const pansy = P("Pansy Baggins", 1212);
  const ponto = P("Ponto Baggins", 1216, 1311);
  const largo = P("Largo Baggins", 1220, 1312);
  const lily = P("Lily Baggins", 1222, 1312);
  kids([balbo, berylla], mungo, pansy, ponto, largo, lily);
  const laura = P("Laura Grubb");
  wed(mungo, laura);
  const fastolph = P("Fastolph Bolger", 1210);
  wed(pansy, fastolph);
  const mimosa = P("Mimosa Bunce");
  wed(ponto, mimosa);
  const tanta = P("Tanta Hornblower");
  wed(largo, tanta);
  const togo = P("Togo Goodbody");
  wed(lily, togo);

  const bungo = P("Bungo Baggins", 1246, 1326);
  const belba = P("Belba Baggins", 1256, 1356);
  const longo = P("Longo Baggins", 1260, 1350);
  const linda = P("Linda Baggins", 1262, 1363);
  const bingo = P("Bingo Baggins", 1264, 1360);
  kids([mungo, laura], bungo, belba, longo, linda, bingo);
  const rosa = P("Rosa Baggins", 1256);
  const polo = P("Polo Baggins");
  kids([ponto, mimosa], rosa, polo);
  const fosco = P("Fosco Baggins", 1264, 1360);
  kids([largo, tanta], fosco);

  const belladonna = P("Belladonna Took", 1252, 1334);
  wed(bungo, belladonna);
  const rudigar = P("Rudigar Bolger", 1255, 1348);
  wed(belba, rudigar);
  const camellia = P("Camellia Sackville");
  wed(longo, camellia);
  const bodo = P("Bodo Proudfoot");
  wed(linda, bodo);
  const chica = P("Chica Chubb");
  wed(bingo, chica);
  const hildigrim = P("Hildigrim Took", 1240, 1341);
  wed(rosa, hildigrim);
  const ruby = P("Ruby Bolger", 1264);
  wed(fosco, ruby);

  const bilbo = P("Bilbo Baggins", 1290);
  kids([bungo, belladonna], bilbo);
  const otho = P("Otho Sackville-Baggins", 1310, 1412);
  kids([longo, camellia], otho);
  const lobelia = P("Lobelia Bracegirdle", 1318, 1420, ["Lobelia Sackville-Baggins"]);
  wed(otho, lobelia);
  const odo = P("Odo Proudfoot", 1304, 1405);
  kids([linda, bodo], odo);
  const falco = P("Falco Chubb-Baggins", 1303, 1399);
  kids([bingo, chica], falco);
  const posco = P("Posco Baggins", 1302);
  const prisca = P("Prisca Baggins", 1306);
  kids([polo], posco, prisca);
  const gilly = P("Gilly Brownlock");
  wed(posco, gilly);
  const wilibald = P("Wilibald Bolger", 1304, 1400);
  wed(prisca, wilibald);
  const dora = P("Dora Baggins", 1302, 1406);
  const drogo = P("Drogo Baggins", 1308, 1380);
  const dudo = P("Dudo Baggins", 1311, 1409);
  kids([fosco, ruby], dora, drogo, dudo);
  const primula = P("Primula Brandybuck", 1320, 1380);
  wed(drogo, primula);

  const lotho = P("Lotho Sackville-Baggins", 1364, 1419);
  kids([otho, lobelia], lotho);
  const olo = P("Olo Proudfoot", 1346, 1435);
  kids([odo], olo);
  const poppy = P("Poppy Chubb-Baggins", 1344);
  kids([falco], poppy);
  const filibert = P("Filibert Bolger", 1342, 1443);
  wed(poppy, filibert);
  const ponto2 = P("Ponto Baggins", 1346);
  const porto = P("Porto Baggins", 1348);
  const peony = P("Peony Baggins", 1350);
  kids([posco, gilly], ponto2, porto, peony);
  const milo = P("Milo Burrows", 1347);
  wed(peony, milo);
  const frodo = P("Frodo Baggins", 1368);
  kids([drogo, primula], frodo);
  const daisy = P("Daisy Baggins", 1350);
  kids([dudo], daisy);
  const griffo = P("Griffo Boffin", 1344);
  wed(daisy, griffo);

  kids([olo], P("Sancho Proudfoot", 1390));
  kids([ponto2], P("Angelica Baggins", 1381));
  kids(
    [peony, milo],
    P("Mosco Burrows", 1387),
    P("Moro Burrows", 1391),
    P("Myrtle Burrows", 1393),
    P("Minto Burrows", 1396),
  );

  // Took of Great Smials
  const isengrim2 = P("Isengrim Took II", 1020, 1122);
  const isumbras3 = P("Isumbras Took III", 1066, 1159);
  kids([isengrim2], isumbras3);
  const ferumbras2 = P("Ferumbras Took II", 1101, 1201);
  const bandobras = P("Bandobras Took", 1104, 1206, ["Bullroarer"]);
  kids([isumbras3], ferumbras2, bandobras);
  const fortinbras1 = P("Fortinbras Took I", 1145, 1248);
  kids([ferumbras2], fortinbras1);
  const gerontius = P("Gerontius Took", 1190, 1320, ["the Old Took"]);
  kids([fortinbras1], gerontius);
  const adamanta = P("Adamanta Chubb");
  wed(gerontius, adamanta);

  const isumbras4 = P("Isumbras Took IV", 1238, 1339);
  const hildigard = P("Hildigard Took");
  b.event("death", [hildigard], { note: "Died young.", sources: [appC] });
  const isembard = P("Isembard Took", 1247, 1346);
  const hildibrand = P("Hildibrand Took", 1249, 1334);
  const donnamira = P("Donnamira Took", 1256, 1348);
  const mirabella = P("Mirabella Took", 1260, 1360);
  kids(
    [gerontius, adamanta],
    P("Isengrim Took III", 1232, 1330),
    hildigard,
    isumbras4,
    hildigrim,
    P("Isembold Took", 1242, 1346),
    P("Hildifons Took", 1244),
    isembard,
    hildibrand,
    belladonna,
    donnamira,
    mirabella,
    P("Isengar Took", 1262, 1360),
  );
  const hugo = P("Hugo Boffin", 1254, 1345);
  wed(donnamira, hugo);
  const gorbadoc = P("Gorbadoc Brandybuck", 1260, 1363, ["Broadbelt"]);
  wed(mirabella, gorbadoc);

  const fortinbras2 = P("Fortinbras Took II", 1278, 1380);
  kids([isumbras4], fortinbras2);
  const lalia = P("Lalia Clayhanger");
  wed(fortinbras2, lalia);
  kids([fortinbras2, lalia], P("Ferumbras Took III", 1316, 1415));
  const adalgrim = P("Adalgrim Took", 1280, 1382);
  kids([hildigrim, rosa], adalgrim);
  const flambard = P("Flambard Took", 1287, 1389);
  kids([isembard], flambard);
  const sigismond = P("Sigismond Took", 1290, 1391);
  kids([hildibrand], sigismond);

  const paladin = P("Paladin Took II", 1333, 1434);
  const esmeralda = P("Esmeralda Took", 1336);
  kids([adalgrim], paladin, esmeralda);
  const eglantine = P("Eglantine Banks");
  wed(paladin, eglantine);
  const saradoc = P("Saradoc Brandybuck", 1340, 1432, ["Scattergold"]);
  wed(esmeralda, saradoc);
  const adelard = P("Adelard Took", 1328, 1423);
  kids([flambard], adelard);
  const rosamunda = P("Rosamunda Took", 1338);
  const ferdinand = P("Ferdinand Took", 1340);
  kids([sigismond], rosamunda, ferdinand);
  const odovacar = P("Odovacar Bolger", 1335, 1431);
  wed(rosamunda, odovacar);

  const peregrin = P("Peregrin Took I", 1390, undefined, ["Pippin"]);
  kids(
    [paladin, eglantine],
    P("Pearl Took", 1375),
    P("Pimpernel Took", 1379),
    P("Pervinca Took", 1385),
    peregrin,
  );
  const diamond = P("Diamond of Long Cleeve", 1395);
  wed(peregrin, diamond);
  kids([adelard], P("Reginard Took", 1369), P("Everard Took", 1380));
  const estella = P("Estella Bolger", 1385);
  kids([odovacar, rosamunda], P("Fredegar Bolger", 1380, undefined, ["Fatty"]), estella);
  kids([ferdinand], P("Ferdibrand Took", 1383));
  const faramir = P("Faramir Took I", 1430);
  kids([peregrin, diamond], faramir);
  const goldilocks = P("Goldilocks Gardner", 1431);
  wed(faramir, goldilocks);

  // Brandybuck of Buckland
  const gorhendad = P("Gorhendad Oldbuck");
  const gormadoc = P("Gormadoc Brandybuck", 1134, 1236, ["Deepdelver"]);
  b.tie("other", gorhendad, gormadoc, {
    note: "Forefather; the generations between are not shown in the tree.",
    sources: [appC],
  });
  const malva = P("Malva Headstrong");
  wed(gormadoc, malva);
  const madoc = P("Madoc Brandybuck", 1175, 1277, ["Proudneck"]);
  const sadoc = P("Sadoc Brandybuck", 1179);
  kids([gormadoc, malva], madoc, sadoc, P("Marroc Brandybuck", 1182));
  const hanna = P("Hanna Goldworthy");
  wed(madoc, hanna);
  const marmadoc = P("Marmadoc Brandybuck", 1217, 1310, ["Masterful"]);
  kids([madoc, hanna], marmadoc);
  const salvia = P("Salvia Brandybuck", 1226);
  kids([sadoc], salvia);
  const adaldrida = P("Adaldrida Bolger", 1218);
  wed(marmadoc, adaldrida);
  const orgulas = P("Orgulas Brandybuck", 1268);
  kids([marmadoc, adaldrida], gorbadoc, orgulas);

  const rorimac = P("Rorimac Brandybuck", 1302, 1408, ["Goldfather", "Old Rory"]);
  const saradas = P("Saradas Brandybuck", 1308, 1407);
  const asphodel = P("Asphodel Brandybuck", 1313, 1412);
  kids(
    [gorbadoc, mirabella],
    rorimac,
    P("Amaranth Brandybuck", 1304, 1398),
    saradas,
    P("Dodinas Brandybuck"),
    asphodel,
    P("Dinodas Brandybuck"),
    primula,
  );
  const menegilda = P("Menegilda Goold");
  wed(rorimac, menegilda);
  const rufus = P("Rufus Burrows");
  wed(asphodel, rufus);
  kids([asphodel, rufus], milo);
  const gorbulas = P("Gorbulas Brandybuck", 1308);
  kids([orgulas], gorbulas);

  const merimac = P("Merimac Brandybuck", 1342, 1430);
  kids([rorimac, menegilda], saradoc, merimac);
  const seredic = P("Seredic Brandybuck", 1348);
  kids([saradas], seredic);
  const hilda = P("Hilda Bracegirdle", 1354);
  wed(seredic, hilda);
  const marmadas = P("Marmadas Brandybuck", 1343);
  kids([gorbulas], marmadas);

  const meriadoc = P("Meriadoc Brandybuck", 1382, undefined, ["Merry", "the Magnificent"]);
  kids([saradoc, esmeralda], meriadoc);
  wed(meriadoc, estella);
  kids([merimac], P("Berilac Brandybuck", 1380));
  kids(
    [seredic, hilda],
    P("Doderic Brandybuck", 1389),
    P("Ilberic Brandybuck", 1391),
    P("Celandine Brandybuck", 1394),
  );
  kids(
    [marmadas],
    P("Merimas Brandybuck", 1381),
    P("Mentha Brandybuck", 1383),
    P("Melilot Brandybuck", 1385),
  );

  // Bolger of Budgeford
  const gundolpho = P("Gundolpho Bolger", 1131, 1230);
  const alfrida = P("Alfrida of the Yale");
  wed(gundolpho, alfrida);
  const gundahar = P("Gundahar Bolger", 1174, 1275);
  const rudolph = P("Rudolph Bolger", 1178);
  const gundahad = P("Gundahad Bolger", 1180);
  kids([gundolpho, alfrida], gundahar, rudolph, gundahad);
  const dina = P("Dina Diggle");
  wed(gundahar, dina);
  const cora = P("Cora Goodbody");
  wed(rudolph, cora);
  const adalgar = P("Adalgar Bolger", 1215, 1314);
  kids([gundahar, dina], adalgar, adaldrida);
  kids([rudolph, cora], fastolph);
  const gundabald = P("Gundabald Bolger", 1222);
  kids([gundahad], gundabald);
  wed(gundabald, salvia);

  const rudibert = P("Rudibert Bolger", 1260);
  kids([adalgar], rudigar, rudibert, ruby);
  const amethyst = P("Amethyst Hornblower");
  wed(rudibert, amethyst);
  const theobald = P("Theobald Bolger", 1261);
  kids([gundabald, salvia], theobald);
  const nina = P("Nina Lightfoot");
  wed(theobald, nina);

  const herugar = P("Herugar Bolger", 1295, 1390);
  kids([rudigar, belba], herugar);
  const jessamine = P("Jessamine Boffin", 1297, "1401~");
  wed(herugar, jessamine);
  const adalbert = P("Adalbert Bolger", 1301, 1397);
  kids([rudibert, amethyst], adalbert);
  const gerda = P("Gerda Boffin", 1304, 1404);
  wed(adalbert, gerda);
  kids([theobald, nina], wilibald);
  kids([herugar, jessamine], odovacar);
  kids([adalbert, gerda], filibert);
  kids(
    [wilibald, prisca],
    P("Wilimar Bolger", 1347),
    P("Heribald Bolger", 1351),
    P("Nora Bolger", 1360),
  );

  // Boffin of the Yale
  const buffo = P("Buffo Boffin");
  const ivy = P("Ivy Goodenough");
  wed(buffo, ivy);
  const bosco = P("Bosco Boffin", 1167, 1258);
  kids([buffo, ivy], bosco, P("Basso Boffin", 1169), P("Briffo Boffin", 1170), berylla);
  const otto = P("Otto Boffin", 1212, 1300, ["Otto the Fat"]);
  kids([bosco], otto);
  const lavender = P("Lavender Grubb");
  wed(otto, lavender);
  const uffo = P("Uffo Boffin", 1257);
  const rollo = P("Rollo Boffin", 1260);
  const primrose = P("Primrose Boffin", 1265);
  kids([otto, lavender], hugo, uffo, rollo, primrose);
  const sapphira = P("Sapphira Brockhouse");
  wed(uffo, sapphira);
  wed(rollo, P("Druda Burrows"));
  const blanco = P("Blanco Bracegirdle");
  wed(primrose, blanco);

  const jago = P("Jago Boffin", 1294, 1386);
  kids([hugo, donnamira], jago, jessamine);
  const gruffo = P("Gruffo Boffin", 1300, 1399);
  kids([uffo, sapphira], gruffo, gerda);
  const bruno = P("Bruno Bracegirdle", 1313, 1410);
  kids([primrose, blanco], bruno, lobelia);
  const vigo = P("Vigo Boffin", 1337, 1430);
  kids([jago], vigo);
  kids([gruffo], griffo);
  kids([bruno], P("Hugo Bracegirdle", 1350), hilda);
  kids([vigo], P("Folco Boffin", 1378));
  kids([griffo, daisy], P("Tosto Boffin", 1388));

  // The Longfather-tree of Master Samwise
  const hamfastOfGamwich = P("Hamfast of Gamwich", 1160);
  const wiseman = P("Wiseman Gamwich", 1200);
  kids([hamfastOfGamwich], wiseman);
  const hob = P("Hob Gammidge", 1246, undefined, ["the Roper", "Old Gammidgy"]);
  kids([wiseman], hob);
  const holmanGreenhanded = P("Holman the greenhanded", 1210);
  const rowan = P("Rowan", 1249);
  const halfredGreenhand = P("Halfred Greenhand", 1251);
  const roseOfHolman = P("Rose", 1262);
  kids(
    [holmanGreenhanded],
    rowan,
    halfredGreenhand,
    P("Erling", 1254),
    P("Hending", 1259),
    roseOfHolman,
  );
  wed(hob, rowan);
  const cottar = P("Cottar", 1220);
  const cotman = P("Cotman", 1260);
  kids([cottar], cotman, P("Carl", 1263));
  wed(cotman, roseOfHolman);

  const hobson = P("Hobson", 1285, 1384, ["Roper Gamgee"]);
  kids([hob, rowan], hobson);
  kids([halfredGreenhand], P("Holman Greenhand", 1292));
  const holmanCotton = P("Holman Cotton", 1302, undefined, ["Long Hom"]);
  kids([cotman, roseOfHolman], holmanCotton);

  const andwise = P("Andwise Roper", 1323, undefined, ["Andy"]);
  const hamfast = P("Hamfast Gamgee", 1326, 1428, ["Ham", "the Gaffer"]);
  const halfredOfOverhill = P("Halfred of Overhill", 1332);
  kids([hobson], andwise, hamfast, P("May", 1328), halfredOfOverhill);
  const bell = P("Bell Goodchild");
  wed(hamfast, bell);
  const tolman = P("Tolman Cotton", 1341, 1440, ["Tom"]);
  kids([holmanCotton], tolman, P("Wilcome Cotton", 1346, undefined, ["Will"]));
  const lilyBrown = P("Lily Brown");
  wed(tolman, lilyBrown);
  kids([andwise], P("Anson Roper", 1361));
  kids([halfredOfOverhill], P("Halfast Gamgee", 1372, undefined, ["Hal"]));

  const samwise = P("Samwise Gamgee", 1380, undefined, ["Sam"]);
  const marigold = P("Marigold Gamgee", 1383);
  kids(
    [hamfast, bell],
    P("Hamson Gamgee", 1365),
    P("Halfred Gamgee", 1369),
    P("Daisy Gamgee", 1372),
    P("May Gamgee", 1376),
    samwise,
    marigold,
  );
  const tomYoung = P("Tolman Cotton", 1380, undefined, ["Tom"]);
  const rose = P("Rose Cotton", 1384, 1482, ["Rosie"]);
  kids(
    [tolman, lilyBrown],
    tomYoung,
    rose,
    P("Wilcome Cotton", 1384, undefined, ["Jolly"]),
    P("Bowman Cotton", 1386, undefined, ["Nick"]),
    P("Carl Cotton", 1389, undefined, ["Nibs"]),
  );
  wed(marigold, tomYoung);
  wed(samwise, rose, "1420-05-01");
  b.event("marriage", [samwise, rose], { date: "1420-05-01", sources: [appB] });

  const elanor = P("Elanor Gardner", 1421, undefined, ["the Fair"]);
  const frodoGardner = P("Frodo Gardner", 1423);
  kids(
    [samwise, rose],
    elanor,
    frodoGardner,
    P("Rose Gardner", 1425),
    P("Merry Gardner", 1427),
    P("Pippin Gardner", 1429),
    goldilocks,
    P("Hamfast Gardner", 1432),
    P("Daisy Gardner", 1433),
    P("Primrose Gardner", 1435),
    P("Bilbo Gardner", 1436),
    P("Ruby Gardner", 1438),
    P("Robin Gardner", 1440),
    P("Tolman Gardner", 1442, undefined, ["Tom"]),
  );
  const fastred = P("Fastred of Greenholm");
  wed(elanor, fastred);
  kids([elanor, fastred], P("Elfstan Fairbairn", 1454));
  const holfast = P("Holfast Gardner", 1462);
  kids([frodoGardner], holfast);
  kids([holfast], P("Harding of the Hill", 1501));

  // Events
  const drowning = b.event("other", [drogo, primula], {
    date: "1380",
    place: brandywine,
    note: "Drowned together while boating on the Brandywine.",
    sources: [appC, story],
  });
  const claim = (statement: string, certainty: Certainty) =>
    a.claims.push({ id: b.id("c"), about: drowning, statement, certainty, sources: [story] });
  claim(
    "The Gaffer, at the Ivy Bush: an accident while the couple were out in a boat during one of Drogo's stays at Brandy Hall.",
    "family_account",
  );
  claim(
    "Sandyman, at the Ivy Bush: Primula shoved Drogo overboard and he dragged her down with him.",
    "disputed",
  );

  b.event("residence", [frodo], { date: "1380/1389", place: brandyHall, sources: [story] });
  b.tie("incorporated_into_household", rorimac, frodo, {
    start: "1380",
    end: "1389",
    certainty: "uncertain",
    note:
      "Raised at Brandy Hall, where Rorimac was Master; the books don't say who had charge of him.",
    sources: [story],
  });
  b.tie("adoptive_parent", bilbo, frodo, {
    start: "1389",
    note: "Adopted as his heir.",
    sources: [story],
  });
  b.event("adoption", [frodo, bilbo], { date: "1389", place: bagEnd, sources: [story] });

  b.event("other", [bilbo, frodo], {
    date: "1401-09-22",
    place: bagEnd,
    note: "Bilbo's Farewell Party.",
    sources: [appB, story],
  });
  b.event("other", [frodo, bilbo], {
    date: "1421-09-29",
    place: havens,
    note: "Sailed West from the Grey Havens.",
    sources: [appB],
  });
  b.event("other", [samwise], {
    date: "1482-09-22",
    place: bagEnd,
    note: "Rode from Bag End; said to have passed over the Sea.",
    sources: [appC, appB],
  });

  // Bag End
  const owner = (holder: Id, start: FuzzyDate | undefined, end: FuzzyDate | undefined, src: Id) =>
    a.interests.push({
      id: b.id("i"),
      holder,
      place: bagEnd,
      role: "recorded_owner",
      start,
      end,
      sources: [src],
    });
  owner(bungo, undefined, "1326", hobbit);
  owner(bilbo, undefined, "1401", story);
  owner(frodo, "1401", "1418", story);
  owner(lobelia, "1418", "1419", story);
  owner(frodo, "1419", "1421", story);
  owner(samwise, "1421", undefined, story);

  a.home = frodo;
  return a;
}
