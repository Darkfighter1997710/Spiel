// dialogue-ui.js – zeigt ein laufendes Gespräch am Bildschirm (Textfeld unten, Antwort-Knöpfe).
// Die Logik steckt in dialogue.js; hier wird nur angezeigt und Antippen/Antworten weitergereicht.

export function createDialogueUI(els, handlers) {
  const { root, hud, tap, speaker, text, choices, hint } = els;
  let visible = false;          // merkt sich selbst, ob das Fenster gerade sichtbar ist
  let shownNode = null;
  let shownText = null;
  let choicesFor = null;

  // Antippen irgendwo auf dem Bildschirm: Text vervollständigen bzw. weiter
  tap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handlers.onTap();
  });

  function hide() {
    visible = false;
    root.hidden = true;
    hud.classList.remove('dialogue-active');
    shownNode = null; shownText = null; choicesFor = null;
    choices.textContent = '';
  }

  function show() {
    visible = true;
    root.hidden = false;
    hud.classList.add('dialogue-active');   // blendet Joystick und Spiel-Buttons aus
  }

  // Wird jedes Bild mit dem DialogueRunner aufgerufen; ändert das Dokument nur, wenn sich etwas ändert
  function render(runner) {
    if (!runner || runner.finished || !runner.node) { hide(); return; }
    if (!visible) show();
    const n = runner.node;

    if (shownNode !== n.id) {
      shownNode = n.id;
      shownText = null;
      choicesFor = null;
      speaker.textContent = n.speaker || '';
      choices.textContent = '';
    }
    const vis = runner.visibleText;
    if (vis !== shownText) { shownText = vis; text.textContent = vis; }

    hint.hidden = !(runner.textComplete && !runner.hasChoices);

    if (runner.textComplete && runner.hasChoices && choicesFor !== n.id) {
      choicesFor = n.id;
      choices.textContent = '';
      n.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.textContent = c.text;
        b.addEventListener('click', () => handlers.onChoose(i));
        choices.appendChild(b);
      });
    }
  }

  return { render, hide };
}
