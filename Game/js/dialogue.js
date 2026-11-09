// dialogue.js – Gesprächstext und Gesprächsablauf (ohne Anzeige, dadurch testbar).
// Ein Gespräch ist ein Netz aus "Knoten". Jeder Knoten hat einen Text des Sprechers und entweder
//   next: 'id'   (nach dem Antippen geht es weiter, null = Gespräch endet) oder
//   choices: [{ text, next }]   (der Spieler wählt eine Antwort).

export const SPEAKER_GUARD = 'Wärter';

// Der Wärter: grummelig, trockener Humor, zwölf Jahre im Dienst. Er verrät genug, um neugierig zu machen,
// aber nichts Festes (es gibt noch kein Aufgabensystem).
export const GUARD_DIALOGUE = Object.freeze({
  start: 'g1',
  nodes: {
    g1: {
      speaker: SPEAKER_GUARD,
      text: 'Na endlich, du bist wach. Ich dachte schon, ich müsste dich mit dem Wassereimer wecken.',
      next: 'g2',
    },
    g2: {
      speaker: SPEAKER_GUARD,
      text: 'Du hast länger geschlafen als der Letzte in dieser Zelle. Der ist übrigens nie wieder aufgewacht.',
      choices: [
        { text: 'Wo bin ich hier?', next: 'a1' },
        { text: 'Lass mich sofort raus!', next: 'b1' },
        { text: 'Wer bist du?', next: 'c1' },
      ],
    },
    a1: {
      speaker: SPEAKER_GUARD,
      text: 'Im Verlies unter Burg Schwarzfels. Der Service ist schlecht, aber die Aussicht ist unschlagbar: Stein. Überall Stein.',
      next: 'm1',
    },
    b1: {
      speaker: SPEAKER_GUARD,
      text: 'Raus? Das höre ich jeden Tag. Von jedem. Und die Antwort bleibt dieselbe: Nein.',
      next: 'm1',
    },
    c1: {
      speaker: SPEAKER_GUARD,
      text: 'Ich bin Garrick. Zwölf Jahre Wächter, zwölf Jahre Suppe aus demselben verfluchten Kessel.',
      next: 'm1',
    },
    m1: {
      speaker: SPEAKER_GUARD,
      text: 'Hör gut zu, Gefangener. Der Hauptmann hat nach dir gefragt. Er glaubt, du weißt etwas. Etwas Wichtiges.',
      choices: [
        { text: 'Ich weiß gar nichts.', next: 'd1' },
        { text: 'Was will er von mir wissen?', next: 'd2' },
        { text: 'Vielleicht können wir verhandeln.', next: 'd3' },
      ],
    },
    d1: {
      speaker: SPEAKER_GUARD,
      text: 'Genau das habe ich ihm gesagt. Er glaubt dir nicht. Ehrlich gesagt: Ich dir auch nicht.',
      next: 'e1',
    },
    d2: {
      speaker: SPEAKER_GUARD,
      text: 'Das sagt er dir selbst. Falls du dann noch bei Verstand bist. Seine Verhöre sind … gründlich.',
      next: 'e1',
    },
    d3: {
      speaker: SPEAKER_GUARD,
      text: 'Verhandeln? Du hast nichts, und ich habe die Schlüssel. Aber Mut gefällt mir. Der ist hier unten selten.',
      next: 'e1',
    },
    e1: {
      speaker: SPEAKER_GUARD,
      text: 'Ein Rat, umsonst: Heute Nacht wird die Wache gewechselt. Zwei Stunden lang schaut keiner nach den Zellen.',
      next: 'e2',
    },
    e2: {
      speaker: SPEAKER_GUARD,
      text: 'Wer gründlich sucht, findet vielleicht, was seine Vorgänger hier zurückgelassen haben.',
      next: 'e3',
    },
    e3: {
      speaker: SPEAKER_GUARD,
      text: 'Ich war nie hier. Und du hast nichts gehört. Schlaf gut … falls du kannst.',
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
