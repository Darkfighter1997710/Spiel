# ENTWICKLUNG – Projektbeschreibung für die Weiterarbeit

Diese Datei beschreibt Aufbau, Entscheidungen und Stand des Projekts, damit jede Phase nahtlos auf der letzten
aufbaut. Sie wird bei jeder Phase mit aktualisiert.

## Stand

* **Version 0.5.0:** Zelle, Ich-Perspektive mit Armen/Händen, dynamischer Joystick, Kamera-Wischen,
  Gehen/Sprinten/Springen, Physik und Kollisionen, symmetrische Wände, **Wärter-Auftritt mit Gespräch**
  (nach 15 s Spielzeit; er überbringt: morgen früh Hinrichtung, kein Ausweg, jetzt schlafen), **Schlafen im Bett**
  und **Morgenlicht** in der Zelle, danach **holt der Wärter den Spieler ab** (öffnet die Zellentür, führt ihn durch den Gang,
  Endkarte „Ende von Kapitel 1“). Das ist der aktuelle Schluss des Spiels; spätere Phasen setzen hier an.
* **Fehler in 0.2/0.3 (behoben in 0.4):** Das Bild war komplett schwarz, weil die Szene eine Hintergrundfarbe hatte (siehe
  „Zeichendurchgänge").
* **Nicht vorhanden (bewusst):** Monster, Waffen, Inventar, Quests, Ton. Der Wärter ist die einzige Figur und hat
  keine Spielmechanik (kein Kampf, keine Belohnung); sein Gespräch ist reine Geschichte.
* Spielt als GitHub Pages: `https://darkfighter1997710.github.io/Spiel/Game/`.

## Regeln für jede Phase

1. Auf der zuletzt gelieferten Version aufbauen; funktionierende Teile nicht unnötig ändern.
2. Keine Platzhalter und keine toten Buttons.
3. Vor der Lieferung `npm test` ausführen, Syntax prüfen, Dateien gegenprüfen.
4. Nichts als getestet bezeichnen, was nicht getestet wurde (siehe „Teststatus").
5. Immer eine vollständige, funktionsfähige ZIP-Datei liefern.
6. Technische Probleme verständlich und ohne unnötige Fachbegriffe erklären (der Nutzer arbeitet nur am Smartphone).

## Architektur (alles ES-Module, kein Build-Schritt)

| Datei | Aufgabe |
|---|---|
| `index.html`, `style.css` | Seite und Oberfläche (HUD, Startbildschirm, Einstellungen, Fehlerfenster, Hochformat-Hinweis) |
| `main.js` | Start, Hauptschleife, Kamera (Kopfwippen, Landeruck, Sprint-Weitwinkel), Einstellungen, Zeichendurchgänge |
| `js/loader.js` | lädt Three.js: erst `libs/three.module.min.js`, sonst CDN (feste Version 0.170.0) |
| `js/layout.js` | **Einzige Quelle** für Maße der Zelle und aller Hindernisse; erzeugt die Kollisionskörper (`buildColliders`) |
| `js/physics.js` | `PlayerPhysics`: Bewegung, Schwerkraft, Sprung, Kollisionen. **Ohne Three.js**, deshalb testbar |
| `js/controls.js` | `TouchControls`: dynamischer Joystick links, Wischen rechts, Buttons Sprung/Sprint (+ Tastatur zum Testen) |
| `js/textures.js` | erzeugt alle Texturen beim Start per Canvas (Farb- und Höhenkarte), keine Bilddateien |
| `js/world.js` | baut Zelle, Möbel, Gittertür, Fackel, Licht, Gang, Staub; liefert `scene`, `colliders`, `bounds`, `spawn`, `textures`, `update(t)` |
| `js/arms.js` | `createArms`: Arme und Hände an der Kamera samt Animation |
| `js/guard-event.js` | `GuardEvent`: Zeitplan des Wärter-Auftritts (Zustandsautomat, **ohne Three.js**, testbar) |
| `js/guard.js` | `createGuard`: Wärter-Figur aus einfachen Formen samt Animation (Gehen, Kopf folgt Spieler, Sprechen) |
| `js/dialogue.js` | Gesprächstext (`GUARD_DIALOGUE`), `validateDialogue`, `DialogueRunner` (Schreibmaschine, Antippen, Antworten); **ohne Anzeige**, testbar |
| `js/dialogue-ui.js` | zeigt ein Gespräch am Bildschirm (Textfeld, Antwort-Knöpfe) |
| `js/escort-event.js` | `EscortEvent`: Wärter kommt am Morgen zurück, öffnet die Zellentür, führt den Spieler ab (**ohne Three.js**, testbar) |
| `js/sleep-event.js` | `SleepEvent`: Ablauf des Schlafens (hinlegen, abdunkeln, Nacht, aufwachen, aufstehen); **ohne Three.js**, testbar |
| `scripts/prepare-web.js` | kopiert alles nach `www/` für die Android-App (Capacitor) |
| `tests/*.test.js` | automatische Prüfungen (`npm test`) |

Module bekommen `THREE` als Parameter (`createWorld(THREE, renderer)`, `createArms(THREE, textures)`), `main.js`
lädt alles per `import()` – dadurch erscheint bei einem Ladefehler eine verständliche Meldung statt eines leeren Bildes.

## Wärter-Auftritt (Ablauf)

`GuardEvent` (guard-event.js) läuft nur, wenn wirklich gespielt wird (`active` in `main.js`: gestartet, keine Einstellungen,
Querformat, App im Vordergrund). Zustände: `wait` (15 s Spielzeit zählen) → `door_open` (Tür am Gangende öffnet sich,
1,4 s) → `walk_in` (geht zur Gittertür, bleibt bei z = −3,3 stehen) → `arrive` (0,7 s) → `talk` → `turn` → `walk_out`
(zurück in die dunkle Nische) → `door_close` → `done`. Er kommt **einmal pro Spielstart**. Das Gespräch beginnt ca. 20 s nach
dem Start, der ganze Auftritt dauert je nach Lesetempo ca. 30–60 s.

* **Eingaben gesperrt** nur in `arrive` und `talk` (`inputLocked`): Bewegung, Wischen und Springen werden verworfen, die
  Kamera dreht sich sanft zum Wärter (`cameraLook`), Joystick und Sprung/Sprint-Buttons werden per CSS ausgeblendet
  (`.dialogue-active`). Das Einstellungs-Symbol bleibt bedienbar (Pause hält Auftritt und Gespräch an).
* **Gespräch:** `main.js` startet `DialogueRunner`, wenn `consumeDialogueStart()` wahr wird, und ruft nach dem Ende
  `guardEvent.finishTalk()`. Die Anzeige (`dialogue-ui.js`) liest nur den Runner. Tippen irgendwo = Text vervollständigen
  bzw. weiter; Antworten sind Knöpfe (immer nebeneinander, damit der Wärter sichtbar bleibt).
* **Tür am Gangende:** `world.setEndDoor(0..1)` dreht den Drehpunkt (links angeschlagen) um bis zu 1,75 rad in den Gang.
  Dahinter liegt eine dunkle Nische (schwarze Fläche), aus der der Wärter tritt. Die Tür wirft keinen Schatten (die
  Schatten sind statisch und würden sonst die geschlossene Tür „einfrieren").
* **Wärter-Figur:** 35 Teile, blickt +z, Ursprung am Boden. Wirft keinen Schatten, empfängt aber welche (Gitterstäbe).
  Leichte Eigenhelligkeit, damit er im Gang nicht schwarz wirkt.
* **Anpassen:** Wartezeit und Tempo in `GUARD_EVENT` (guard-event.js), Weg in `GUARD` (layout.js), Text in
  `GUARD_DIALOGUE` (dialogue.js; `validateDialogue` prüft ihn, Test `dialogue.test.js`).
  Regeln für Texte: höchstens 130 Zeichen pro Sprechblase, Antworten höchstens 38 Zeichen (Handy-Lesbarkeit).

## Schlafen und Morgenlicht

* **Freischaltung:** erst nach dem Gespräch (`sleepEvent.unlock()` in `main.js`, wenn das Gespräch endet). Danach zeigt ein
  Hinweis „Geh zum Bett“; **nur in Bettnähe** (`SLEEP.nearDistance` = 0,9 m, `distanceToBed` in layout.js) erscheint der Knopf
  „Schlafen“. Nach dem Schlafen verschwinden Hinweis und Knopf für immer (einmal pro Spielstart).
* **Ablauf** (`SleepEvent`, ca. 11,7 s): `lie_down` (Kamera legt sich ins Bett, Blick schräg zur Decke) → `fade_out`
  (schwarz) → `sleeping` („Du schläfst ein …“, „Die Nacht vergeht …“) → `fade_in` (Augen öffnen sich, „Der Morgen ist
  gekommen.“, Morgenlicht steigt auf) → `stand_up` (steht neben dem Bett auf) → `morning`. In allen Phasen ist die Steuerung
  gesperrt, die Kamera folgt `sleepEvent.cam` (Override in `updateCamera`). Beim Aufstehen setzt `physics.teleport()` die
  Figur auf `SLEEP.stand` (bei belegtem Ziel zurück zum Startpunkt).
* **Morgenlicht** (`world.setMorning(0..1)`): hellere Hemisphäre (1,4 → 2,6), hellerer Himmel im Fenster, hellerer Nebel,
  mehr Staub, schwacher Lichtstrahl (additives Quader-Mesh) und ein **Sonnenstrahl (DirectionalLight mit Schatten)** durchs
  Fenster – die Gitterstäbe werfen Streifen auf den Boden. Das Fenster ist eine **echte Öffnung durch die Wand**
  (`WIN` in world.js); ohne Öffnung käme kein Licht hindurch. Die Sonne wird **erst beim Schlafen erzeugt**
  (`prepareMorning`, solange der Bildschirm schwarz ist), damit das zusätzliche Licht vorher keine Leistung kostet und das
  Übersetzen der Licht-Programme nicht sichtbar ruckelt.
* **Gespräch:** `GUARD_DIALOGUE` in dialogue.js. Auf **jedem** Weg: Hinrichtung morgen früh, es gibt keinen Ausweg, jetzt
  schlafen (Test `dialogue.test.js` prüft das und dass keine Fluchthinweise vorkommen).

## Abholen am Morgen (Ende von Kapitel 1)

* **Start:** `main.js` ruft `escort.begin()`, sobald `sleepEvent.done` (aufgewacht und aufgestanden). Nach 6 s Spielzeit (`startDelay`)
  Ablauf: Tür am Gangende öffnet sich → Wärter geht zur Zellentür → schließt auf (0,9 s) → die Gittertür schwingt nach außen auf
  (`world.setCellGate`, Drehpunkt links, ca. 95°) → kurzes Gespräch (`ESCORT_DIALOGUE`, 2 Sprechblasen, ohne Antworten) →
  Wärter dreht sich um und geht den Gang entlang → der Spieler **folgt automatisch** → Wärter verschwindet in der dunklen Nische
  → Bild wird schwarz → Endkarte (`#end-card`) mit Knopf „Von vorn beginnen“ (lädt die Seite neu).
* **Eingaben gesperrt** ab `unlock` bis zum Ende. Die Kamera schaut den Wärter an (`cameraLook`), danach folgt sie dem Weg
  (`cameraOverride`, gleiche Override-Stelle wie beim Schlafen in `updateCamera`; `cam.phase/amp` kommen vom Ablauf, damit
  Kopfwippen und Armschwung mitlaufen).
* **Weg:** Linienzug Spielerposition → (0, min(z, −1,4)) → Gang bis zur Nische. Der Wärter wartet an der Tür, bis der Spieler
  `gap` = 1,6 m nah ist, und hält dann genau diesen Abstand vor ihm. Kamera dreht höchstens ca. 143°/s.
* **Wichtig für spätere Phasen:** Der Kollisionskörper `tuer` (layout.js) bleibt auch bei geöffneter Zellentür bestehen. Das ist
  im Moment egal (der Spieler wird geführt, nicht gesteuert), muss aber geändert werden, sobald man die Zelle selbst verlassen darf.
  Nach einer Änderung an Schatten werfenden Teilen (Tür offen) wird `world.refreshShadows()` aufgerufen (Schatten sind statisch).

## Zeichendurchgänge (wichtig, hier ging in 0.2/0.3 etwas schief)

Pro Bild: `renderer.clear()` → Welt (Kamera-Ebene 0) → `clearDepth()` → Arme (Ebene 1). **Die Szene darf keine
Hintergrundfarbe haben** (`scene.background = null`, Farbe per `renderer.setClearColor`): Three.js löscht bei einer
Hintergrundfarbe in JEDEM `render()`-Aufruf das ganze Bild, auch bei `autoClear = false`. Der zweite Durchgang hat dann die
Welt wieder weggewischt (nur Arme auf Schwarz). Geprüft in `build.smoke.test.js` und `game.integration.test.js`.
Regel: Die Tests nutzen eine Attrappe von Three.js und erkennen falsche Aufrufe der echten Bibliothek **nicht**. Bei Änderungen
an Zeichenreihenfolge, Licht, Kamera oder Hintergrund deshalb die echte Three.js-Quelle bzw. -Dokumentation prüfen.

## Koordinaten und Einheiten

Meter. x = rechts, y = oben, z = nach hinten. Startblick = −z. Zelle innen x ±2,5, z ±2,2, Höhe 3,0; Wandstärke 0,5.
Tür in der vorderen Wand (z = −2,2), Gang dahinter nur sichtbar. Spawn (0,4 / 1,2). Kamera-Yaw 0 blickt nach −z.

## Wichtige Entscheidungen (nicht ohne Grund ändern)

* **Physik:** Spieler = Zylinder (Radius 0,32, Höhe 1,8, Augen 1,65), Hindernisse = Quader (AABB), Kollision Kreis gegen
  Rechteck (ecken-sicher). Feste Schrittweite 1/90 s. **Reihenfolge je Schritt: erst vertikal, dann horizontal** (sonst
  steckt die Figur an Möbelkanten kurz im Möbel). Stehen und Anstoßen nutzen denselben Radius. Am Boden werden Kanten bis
  0,30 m überstiegen, in der Luft nur 0,05 m (Bett erreichbar, Tisch nicht). Sprung nur vom Boden; Sprungwunsch wird
  0,12 s gemerkt (kein Luftsprung). Zusätzlich Sicherheitsnetz `BOUNDS` (Innenraum-Klemmung).
* **Texturen per Code:** keine Dateien, die fehlen können. Steintextur ist **spiegelsymmetrisch** (`mirrorCanvas`), und die
  Texturkoordinaten der Steinflächen sind **an Weltkoordinaten gebunden** (`worldUV`, Ursprung Raummitte). Dadurch sind
  gegenüberliegende Wände exakte Spiegelbilder, Steinreihen liegen rundum auf gleicher Höhe (Wand-Kachel 2,1 m = 7 Reihen à
  0,3 m → genau 10 Reihen bis zur Decke). Holz/Stoff/Stroh nutzen `scaleUV` mit Maserungsrichtung (`grain`).
* **Licht:** nur 3 Lichter (Hemisphäre, Fackel, Gang). Fackel und Gang werfen Schatten, die **statisch einmal berechnet**
  werden (`shadowMap.autoUpdate = false`). Flackern ändert nur die Helligkeit. Werte oben in `world.js`; Nutzer kann die
  Helligkeit in den Einstellungen anpassen (Belichtung).
* **Arme:** hängen an der Kamera (Kamera ist Kind der Szene), liegen auf **Ebene 1** und werden in einem **zweiten
  Zeichendurchgang** nach `clearDepth()` gezeichnet, damit sie nie in Wände ragen. Lichter müssen deshalb auch auf Ebene 1
  aktiv sein (`light.layers.enable(1)`). Zeichenreihenfolge pro Bild: `clear` → Welt (Ebene 0) → `clearDepth` → Arme (Ebene 1).
  Linker Arm = gespiegelter rechter Arm (`scale.x = -1` am Halter). Animation aus der Kamera-Laufphase (`cam.phase`).
* **Steuerung:** Pointer-Events mit Mehrfingerverfolgung. Links = Joystick (erscheint am Berührpunkt, Mittelpunkt fix, Totzone
  10 %), rechts = Kamera (0,0045 rad/Pixel × Empfindlichkeit), Neigung auf ±1,45 rad begrenzt.
* **Performance:** Pixelverhältnis max. 1,75, Antialiasing nur bei Geräten mit Pixelverhältnis < 2, automatische
  Auflösungsabsenkung bei < 40 FPS (nie wieder erhöht), Gitterstäbe/Nieten als Instanzen.
* **Gesten:** Zoomen, Kontextmenü, Doppeltipp, Scrollen und Pull-to-Refresh sind unterdrückt (`main.js`, `style.css`).
* **Three.js:** Version 0.170.0 fest (Einzeldatei, ohne `three.core.js`). Update nur bewusst und mit Test.

## Tests (`npm test`, Node.js, ohne Browser)

| Datei | prüft |
|---|---|
| `physics.test.js` | 24 Zufallsläufe à 30 000 Schritte, jede Wand/Ecke im Sprint, Tür, Sprung, Bett, Tisch |
| `controls.test.js` | Joystick, Totzone, Wischen, zwei Finger gleichzeitig, Sprung, Sprint |
| `arms.test.js` | Armbewegung: gegengleich, Sprint stärker, Faust, Sprung, Zufallsdauertest |
| `build.smoke.test.js` | Aufbau von Texturen und Welt läuft ohne Programmfehler (Three.js/Canvas als Attrappe) |
| `dialogue.test.js` | Gespräch: Verweise, Schleifenfreiheit, alle 9 Wege enden, Schreibmaschine, Antippen, Antworten, Textlängen |
| `guard-event.test.js` | Zeitplan: zählt nur Spielzeit, 15 s, Reihenfolge der Zustände, Sperre nur im Gespräch, Pause, Zufallsläufe |
| `escort-event.test.js` | Abholen: Reihenfolge, Wärter immer vor dem Spieler mit festem Abstand, Spieler läuft mittig durch die Tür, nie durch Wände, von 6 verschiedenen Startstellen, Kamera ohne Sprünge, Pause, Zufallsläufe |
| `sleep-event.test.js` | Schlafen: Reihenfolge, Morgenlicht steigt gleichmäßig, Abdunkeln vor dem Vorbereiten des Lichts, Kamera ohne Sprünge, kurzer Drehweg, Pause, Zufallsläufe |
| `guard.test.js` | Wärter-Animation: Beine gegengleich, Kopf folgt und ist begrenzt, Mund beim Sprechen, Zufalls-Dauertest |
| `game.integration.test.js` | echtes `main.js` mit Attrappen: Start, Joystick, Sprint gegen Tür, Sprung, Zeichenreihenfolge, **Wärter erscheint nicht vor 15 s, Gespräch komplett durchgespielt, Steuerung gesperrt und danach wieder frei, zum Bett gehen, Schlafen (Kamera liegt, Bild schwarz, Texte, Sonnenlicht erst jetzt), Aufstehen, keine Hintergrundfarbe in der Szene**, Einstellungen; **Rückkehr des Wärters am Morgen, Gespräch, Abführen durch die Tür, schwarzes Bild, Endkarte, Neustart-Knopf** |

## Teststatus: was NICHT geprüft ist

* **Optik** (Aussehen von Zelle, Texturen, Licht, Armen/Händen, Symmetrie auf dem Bildschirm, **Wärter, Tür am Gangende,
  Gesprächsfeld**): kein Browser/keine Grafikkarte in der Entwicklungsumgebung. Lichtwerte sind geschätzt (daher der
  Helligkeitsregler). Ob der Wärter im Gang gut ausgeleuchtet und gut lesbar ist, ist unbekannt.
* **Morgenlicht** (ob Sonnenfleck, Gitterschatten und Lichtstrahl gut aussehen, ob die Zelle „hell genug“ wirkt; Helligkeitswerte `MORNING_SUN`/`MORNING_AMBIENT` oben in world.js sind geschätzt) und der Ruckler beim ersten Erzeugen des Sonnenlichts auf schwachen Handys.
* **Abführen** (Aussehen der aufschwingenden Gittertür, der Kamerafahrt durch den Gang, Tempo, ob das Schwarzwerden und die Endkarte stimmig wirken).
* **Gefühl des Auftritts** (Tempo, Kamerafahrt zum Wärter, Lesbarkeit des Textes auf dem Handy).
* **Echtes Handy** (Bildrate, Gefühl der Steuerung, Vollbild, Querformat-Sperre).
* **Echte Three.js-Bibliothek:** Tests nutzen eine Attrappe; Aufrufe wurden nach bestem Wissen für r170 geschrieben.
* **Android-App-Build** (Capacitor): Anleitung vorhanden, nie ausgeführt.
* `mirrorCanvas` und Textur-Erzeugung auf einem echten Canvas.

## Bekannte Eigenheiten

* `libs/three.module.min.js` liegt nicht im Projekt (kein Internet bei der Entwicklung). Ohne die Datei lädt das Spiel
  Three.js vom CDN; für Offline/Android muss der Nutzer die Datei einmal ablegen (siehe `README.md`).
* Beim Öffnen von `index.html` direkt aus dem Dateimanager funktioniert nichts (Module brauchen eine Web-Adresse).
