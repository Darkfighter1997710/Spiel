// dialogue.js – Gesprächstext und Gesprächsablauf (ohne Anzeige, dadurch testbar).
// Ein Gespräch ist ein Netz aus "Knoten". Jeder Knoten hat einen Text des Sprechers und entweder
//   next: 'id'   (nach dem Antippen geht es weiter, null = Gespräch endet) oder
//   choices: [{ text, next }]   (der Spieler wählt eine Antwort).

export const SPEAKER_GUARD = 'Wärter';

// Der Wärter überbringt eine einzige Nachricht: Morgen früh ist die Hinrichtung, es gibt keinen Ausweg, der Gefangene
// soll jetzt schlafen, um am Tag der Hinrichtung bei Kräften zu sein. Ernst, knapp, ohne Hoffnungsschimmer.
// Die Antworten des Spielers ändern am Inhalt nichts, nur am Ton.
export const GUARD_DIALOGUE = Object.freeze({
  start: 'g1',
  nodes: {
    g1: {
      speaker: SPEAKER_GUARD,
      text: 'Du bist wach. Gut. Hör genau zu, ich sage es nur einmal.',
      next: 'g2',
    },
    g2: {
      speaker: SPEAKER_GUARD,
      text: 'Morgen früh, bei Sonnenaufgang, ist deine Hinrichtung. Man wird dich zum Richtplatz führen.',
      choices: [
        { text: 'Wofür? Was habe ich getan?', next: 'a1' },
        { text: 'Gibt es keinen Ausweg?', next: 'b1' },
        { text: '…', next: 'c1' },
      ],
    },
    a1: {
      speaker: SPEAKER_GUARD,
      text: 'Das spielt keine Rolle mehr. Das Urteil ist gesprochen, und es wird morgen vollstreckt.',
      next: 'm1',
    },
    b1: {
      speaker: SPEAKER_GUARD,
      text: 'Keinen. Kein Aufschub, keine Gnade. Das Urteil ist endgültig.',
      next: 'm1',
    },
    c1: {
      speaker: SPEAKER_GUARD,
      text: 'Schweigen ist klug. Es gibt nichts mehr zu sagen. Das Urteil ist endgültig.',
      next: 'm1',
    },
    m1: {
      speaker: SPEAKER_GUARD,
      text: 'Es gibt keinen Ausweg, mehr nicht. Nur dies: Am Tag deiner Hinrichtung musst du auf eigenen Beinen stehen können.',
      next: 'm2',
    },
    m2: {
      speaker: SPEAKER_GUARD,
      text: 'Also leg dich jetzt hin und schlaf. Wer ausgeruht ist, trägt den letzten Gang leichter.',
      choices: [
        { text: 'Ich werde es versuchen.', next: 'e1' },
        { text: 'Wie soll ich jetzt schlafen?', next: 'e2' },
      ],
    },
    e1: {
      speaker: SPEAKER_GUARD,
      text: 'Gut. Das Bett steht an der Wand. Es ist hart, aber es gehört dir für diese Nacht.',
      next: 'f1',
    },
    e2: {
      speaker: SPEAKER_GUARD,
      text: 'Schließ die Augen und atme ruhig. Es ist deine letzte Nacht. Verschwende sie nicht.',
      next: 'f1',
    },
    f1: {
      speaker: SPEAKER_GUARD,
      text: 'Schlaf jetzt. Bei Sonnenaufgang hole ich dich ab.',
      next: null,
    },
  },
});

// Prüft ein Gespräch auf Fehler: alle Verweise gültig, nichts unerreichbar, keine Endlosschleifen.
// Gibt eine Liste von Problemen zurück (leer = in Ordnung).
export function validateDialogue(data) {
  const problems = [];
  const ids = Object.keys(data.nodes);
  if (!data.nodes[data.start]) problems.push(`Startknoten "${data.start}" fehlt`);
  const targets = (n) => (n.choices ? n.choices.map((c) => c.next) : [n.next]);
  for (const id of ids) {
    const n = data.nodes[id];
    if (typeof n.text !== 'string' || !n.text.trim()) problems.push(`${id}: Text fehlt`);
    if (n.choices && n.next !== undefined) problems.push(`${id}: hat choices UND next`);
    if (!n.choices && n.next === undefined) problems.push(`${id}: weder next noch choices`);
    if (n.choices && n.choices.length === 0) problems.push(`${id}: leere Auswahl`);
    for (const t of targets(n)) if (t !== null && !data.nodes[t]) problems.push(`${id}: Verweis auf unbekannten Knoten "${t}"`);
    if (n.choices) for (const c of n.choices) if (!c.text || !c.text.trim()) problems.push(`${id}: Antwort ohne Text`);
  }
  // Erreichbarkeit und Zyklen (Tiefensuche)
  const seen = new Set();
  const stack = new Set();
  const visit = (id) => {
    if (stack.has(id)) { problems.push(`Endlosschleife bei "${id}"`); return; }
    if (seen.has(id)) return;
    seen.add(id); stack.add(id);
    for (const t of targets(data.nodes[id])) if (t !== null && data.nodes[t]) visit(t);
    stack.delete(id);
  };
  if (data.nodes[data.start]) visit(data.start);
  for (const id of ids) if (!seen.has(id)) problems.push(`Knoten "${id}" ist unerreichbar`);
  return problems;
}

// Spielt ein Gespräch ab: Schreibmaschinen-Effekt, Antippen, Antwortwahl.
export class DialogueRunner {
  constructor(data, { charsPerSecond = 40 } = {}) {
    this.data = data;
    this.cps = charsPerSecond;
    this.node = null;
    this.finished = false;
    this._shown = 0;
  }

  start() {
    this.finished = false;
    this._enter(this.data.start);
  }

  _enter(id) {
    const n = this.data.nodes[id];
    if (!n) throw new Error(`Unbekannter Gesprächsknoten: ${id}`);
    this.node = { id, ...n };
    this._shown = 0;
  }

  _goto(next) {
    if (next === null || next === undefined) { this.finished = true; return; }
    this._enter(next);
  }

  // dt in Sekunden
  update(dt) {
    if (this.finished || !this.node) return;
    const len = this.node.text.length;
    if (this._shown < len) this._shown = Math.min(len, this._shown + dt * this.cps);
  }

  get visibleText() { return this.node ? this.node.text.slice(0, Math.floor(this._shown)) : ''; }
  get textComplete() { return !!this.node && Math.floor(this._shown) >= this.node.text.length; }
  get hasChoices() { return !!(this.node && this.node.choices && this.node.choices.length); }
  get talking() { return !this.finished && !!this.node && !this.textComplete; }

  // Antippen: zuerst Text sofort vollständig zeigen, dann weiter. Bei einer Auswahl passiert nichts.
  tap() {
    if (this.finished || !this.node) return;
    if (!this.textComplete) { this._shown = this.node.text.length; return; }
    if (this.hasChoices) return;
    this._goto(this.node.next);
  }

  // Antwort wählen (Nummer in der Liste). Gibt true zurück, wenn die Wahl angenommen wurde.
  choose(index) {
    if (this.finished || !this.textComplete || !this.hasChoices) return false;
    const c = this.node.choices[index];
    if (!c) return false;
    this._goto(c.next);
    return true;
  }
}
