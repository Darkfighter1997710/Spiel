// Prüft Gesprächstext und Gesprächsablauf:  node tests/dialogue.test.js
import { DialogueRunner, GUARD_DIALOGUE, validateDialogue } from '../js/dialogue.js';

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('FEHLER:', m); } };

// 1) Text-Netz ist in Ordnung
const problems = validateDialogue(GUARD_DIALOGUE);
ok(problems.length === 0, `Gespräch fehlerhaft: ${problems.join('; ')}`);
// kaputte Beispiele werden erkannt
ok(validateDialogue({ start: 'a', nodes: { a: { text: 'x', next: 'zz' } } }).length > 0, 'Verweis ins Leere nicht erkannt');
ok(validateDialogue({ start: 'a', nodes: { a: { text: 'x', next: 'b' }, b: { text: 'y', next: 'a' } } }).length > 0, 'Endlosschleife nicht erkannt');
ok(validateDialogue({ start: 'a', nodes: { a: { text: 'x', next: null }, b: { text: 'y', next: null } } }).length > 0, 'unerreichbarer Knoten nicht erkannt');

// 2) Lesbarkeit auf dem Handy: Texte nicht zu lang
for (const [id, n] of Object.entries(GUARD_DIALOGUE.nodes)) {
  ok(n.text.length <= 130, `${id}: Text zu lang (${n.text.length} Zeichen)`);
  for (const c of n.choices || []) ok(c.text.length <= 38, `${id}: Antwort zu lang (${c.text.length} Zeichen)`);
}

// 3) Schreibmaschine, Antippen, Weiterschalten
{
  const r = new DialogueRunner(GUARD_DIALOGUE, { charsPerSecond: 40 });
  r.start();
  ok(r.node.id === 'g1' && r.visibleText === '' && r.talking, 'Start falsch');
  r.update(0.5);
  ok(r.visibleText.length === 20, `Schreibmaschine falsch (${r.visibleText.length} Zeichen nach 0,5 s)`);
  r.tap();                                           // erster Tipp: Text sofort komplett
  ok(r.textComplete && r.node.id === 'g1' && !r.talking, 'Tipp soll Text vervollständigen');
  r.tap();                                           // zweiter Tipp: weiter
  ok(r.node.id === 'g2', 'zweiter Tipp soll weiterschalten');
  // Auswahlknoten: Tippen allein geht nicht weiter
  r.update(10);
  ok(r.hasChoices && r.textComplete, 'Auswahl fehlt');
  r.tap();
  ok(r.node.id === 'g2', 'Tippen darf bei Auswahl nicht weitergehen');
  ok(r.choose(7) === false, 'ungültige Antwort angenommen');
  ok(r.choose(1) === true && r.node.id === 'b1', 'Antwort 2 führt nicht zu b1');
}
// Antwort erst möglich, wenn der Text fertig ist
{
  const r = new DialogueRunner(GUARD_DIALOGUE); r.start(); r.tap(); r.tap();
  ok(r.node.id === 'g2' && r.choose(0) === false, 'Antwort vor Textende angenommen');
}

// 4) Alle möglichen Wege durchspielen: jeder endet, jeder Knoten wird erreicht
{
  const reached = new Set();
  let paths = 0;
  const walk = (choicesTaken) => {
    const r = new DialogueRunner(GUARD_DIALOGUE);
    r.start();
    let guard = 0, i = 0;
    while (!r.finished && guard++ < 100) {
      reached.add(r.node.id);
      r.update(100);
      if (r.hasChoices) { r.choose((choicesTaken[i++] ?? 0) % r.node.choices.length); } else r.tap();
    }
    ok(r.finished, `Weg ${JSON.stringify(choicesTaken)} endet nicht`);
    return i;
  };
  for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { walk([a, b]); paths++; }
  ok(reached.size === Object.keys(GUARD_DIALOGUE.nodes).length, `nicht alle Knoten erreichbar: ${reached.size}`);
  console.log(`Gespräch: ${Object.keys(GUARD_DIALOGUE.nodes).length} Sprechblasen, ${paths} verschiedene Wege, alle enden.`);
}

// 4b) Auf JEDEM Weg kommen die drei Kernaussagen vor: Hinrichtung morgen, kein Ausweg, jetzt schlafen
{
  const allPaths = [];
  const explore = (id, acc) => {
    const n = GUARD_DIALOGUE.nodes[id];
    const text = acc + ' ' + n.text;
    const nexts = n.choices ? n.choices.map((c) => c.next) : [n.next];
    for (const nx of nexts) { if (nx === null) allPaths.push(text); else explore(nx, text); }
  };
  explore(GUARD_DIALOGUE.start, '');
  for (const t of allPaths) {
    ok(/Hinrichtung/.test(t) && /morgen|Morgen/.test(t), 'Hinrichtung morgen fehlt auf einem Weg');
    ok(/Ausweg/.test(t), 'Kein-Ausweg-Aussage fehlt auf einem Weg');
    ok(/schlaf/i.test(t), 'Aufforderung zu schlafen fehlt auf einem Weg');
    ok(!/Wache gewechselt|Flucht|entkomm|fliehen|Schlüssel/i.test(t), 'Hoffnung/Fluchthinweis im Gespräch, obwohl es keinen Ausweg geben soll');
  }
  console.log(`Inhalt: Hinrichtung, kein Ausweg und Schlafen kommen auf allen ${allPaths.length} Wegen vor, ohne Fluchthinweise.`);
}

// 5) Nach dem Ende passiert nichts mehr
{
  const r = new DialogueRunner(GUARD_DIALOGUE, { charsPerSecond: 1000 });
  r.start();
  for (let i = 0; i < 40 && !r.finished; i++) { r.update(1); if (r.hasChoices) r.choose(0); else r.tap(); }
  ok(r.finished, 'Gespräch beendet sich nicht');
  r.tap(); r.update(1); ok(r.choose(0) === false && r.finished, 'Eingaben nach dem Ende ändern etwas');
}

console.log(failures === 0 ? 'ALLE GESPRÄCHS-TESTS BESTANDEN' : `${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);
