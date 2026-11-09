# ENTWICKLUNG – Projektbeschreibung für die Weiterarbeit

Diese Datei beschreibt Aufbau, Entscheidungen und Stand des Projekts, damit jede Phase nahtlos auf der letzten
aufbaut. Sie wird bei jeder Phase mit aktualisiert.

## Stand

* **Version 0.4.0:** Zelle, Ich-Perspektive mit Armen/Händen, dynamischer Joystick, Kamera-Wischen,
  Gehen/Sprinten/Springen, Physik und Kollisionen, symmetrische Wände, **Wärter-Auftritt mit Gespräch**
  (nach 15 s Spielzeit; er kündigt die Hinrichtung für morgen an und schickt den Spieler schlafen),
  **Schlafen im Bett mit Sonnenaufgang** (danach ist die Zelle durch das Fenster hell).
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
| `js/sleep-event.js` | `SleepEvent`: Ablauf „Schlafen“ (Zustandsautomat, **ohne Three.js**, testbar): Schwarzblende, liegen, aufwachen, Tageslicht |
| `js/guard.js` | `createGuard`: Wärter-Figur aus einfachen Formen samt Animation (Gehen, Kopf folgt Spieler, Sprechen) |
| `js/dialogue.js` | Gesprächstext (`GUARD_DIALOGUE`), `validateDialogue`, `DialogueRunner` (Schreibmaschine, Antippen, Antworten); **ohne Anzeige**, testbar |
| `js/dialogue-ui.js` | zeigt ein Gespräch am Bildschirm (Textfeld, Antwort-Knöpfe) |
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
  **Inhalt (seit 0.4.0):** Der Wärter sagt, dass der Gefangene morgen früh zur Hinrichtung abgeholt wird, und rät, jetzt zu
  schlafen, um morgen fit zu sein; er zeigt auf das Bett. Gesprächsform (3 + 3 Antworten, 9 Wege) unverändert.
  Regeln für Texte: höchstens 130 Zeichen pro Sprechblase, Antworten höchstens 38 Zeichen (Handy-Lesbarkeit).

## Schlafen und Tageslicht

* **Voraussetzung:** Der Wärter ist fertig (`guardEvent.done`: Gespräch vorbei, Tür zu). Dann erscheint ein Hinweis
  „Geh zum Bett“ (max. 8 s), und **nahe am Bett** (≤ 0,95 m Abstand zur Bettkante, `distanceToBed`, `SLEEP_POSE.reach` in
  layout.js) der Knopf **Schlafen** (`#btn-sleep`). Schlafen geht **einmal pro Spielstart**.
* **Ablauf** (`SleepEvent`, sleep-event.js): `fade_out` (1,4 s schwarz, „Du schläfst ein …“) → `asleep` (2,6 s schwarz, Kamera
  springt unsichtbar ins Bett, „Am nächsten Morgen …“) → `wake` (4 s: Schwarz blendet aus, **Tageslicht 0 → 1**) → `get_up`
  (1,6 s: Kamera blendet zurück an den Platz am Bett) → `done`. Zeiten in `SLEEP`. Pausen zählen nicht.
* **Kamera:** `main.js` (`updateCamera`) mischt mit `sleep.lying` zwischen Stehen und `SLEEP_POSE` (Kopf auf dem Kissen,
  x −2,0 / y 0,72 / z 1,8, Blick zur Zellenmitte, wo die Sonne auf den Boden fällt). Die Variablen `yaw`/`pitch` bleiben
  unverändert, deshalb schaut der Spieler nach dem Aufstehen wieder in die alte Richtung. Arme sind im Liegen ausgeblendet.
* **Eingaben gesperrt** während `sleep.active` (Klasse `.sleeping` blendet Joystick und Buttons aus; Einstellungs-Symbol bleibt).
* **Tageslicht** (`world.setDaylight(0..1)`, world.js): (1) `SpotLight` „Sonne“ direkt vor dem Fenster, schräg in die Zelle,
  **ohne Schatten**; (2) Hemisphärenlicht von `AMBIENT_INTENSITY` auf `DAY_AMBIENT`, heller/wärmer; (3) Himmel im Fenster
  von dunkelblau auf hellblau; (4) Nebel heller; (5) Staub deutlicher. Das Sonnenlicht existiert **von Anfang an mit
  Helligkeit 0** – die Lichtanzahl ändert sich nie (sonst müssten alle Shader neu übersetzt werden = Ruckler). Das Tageslicht
  bleibt nach dem Schlafen dauerhaft. Werte: `SUN_INTENSITY`, `DAY_AMBIENT` oben in world.js.
* **Fenster:** Es ist nur eine bemalte Fläche in der massiven Rückwand (kein echtes Loch), deshalb sitzt die Sonne im Raum
  vor der Wand. Wer ein echtes Loch/Schatten der Gitterstäbe möchte, muss Wand und Schattenberechnung (statisch,
  `shadowMap.autoUpdate = false`) anpassen.

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
| `sleep-event.test.js` | Schlafen: Reihenfolge, Werte 0..1, Hinlegen nur im Schwarzen, Tageslicht steigt nur und bleibt, einmalig, Pause, Zufallsläufe, Schlafpose liegt auf dem Bett |
| `guard-event.test.js` | Zeitplan: zählt nur Spielzeit, 15 s, Reihenfolge der Zustände, Sperre nur im Gespräch, Pause, Zufallsläufe |
| `guard.test.js` | Wärter-Animation: Beine gegengleich, Kopf folgt und ist begrenzt, Mund beim Sprechen, Zufalls-Dauertest |
| `game.integration.test.js` | echtes `main.js` mit Attrappen: Start, Joystick, Sprint gegen Tür, Sprung, Zeichenreihenfolge, **Wärter erscheint nicht vor 15 s, Gespräch komplett durchgespielt, Steuerung gesperrt und danach wieder frei, zum Bett laufen, Knopf „Schlafen“, schwarz, Kamera im Bett, Sonne geht auf (Helligkeit gelesen), Aufstehen, Knopf kommt nicht ein zweites Mal**, Einstellungen |

## Teststatus: was NICHT geprüft ist

* **Optik** (Aussehen von Zelle, Texturen, Licht, Armen/Händen, Symmetrie auf dem Bildschirm, **Wärter, Tür am Gangende,
  Gesprächsfeld, Sonnenstrahl und Tageshelligkeit, Blick aus dem Bett, Schwarzblende mit Text, Knopf „Schlafen“**): kein Browser/keine Grafikkarte in der Entwicklungsumgebung. Lichtwerte sind geschätzt (daher der
  Helligkeitsregler). **Ob der Tag deutlich heller wirkt oder zu stark überstrahlt, ist unbekannt** (`SUN_INTENSITY`, `DAY_AMBIENT`). Ob der Wärter im Gang gut ausgeleuchtet und gut lesbar ist, ist unbekannt.
* **Gefühl des Auftritts** (Tempo, Kamerafahrt zum Wärter, Lesbarkeit des Textes auf dem Handy).
* **Echtes Handy** (Bildrate, Gefühl der Steuerung, Vollbild, Querformat-Sperre).
* **Echte Three.js-Bibliothek:** Tests nutzen eine Attrappe; Aufrufe wurden nach bestem Wissen für r170 geschrieben.
* **Android-App-Build** (Capacitor): Anleitung vorhanden, nie ausgeführt.
* `mirrorCanvas` und Textur-Erzeugung auf einem echten Canvas.

## Bekannte Eigenheiten

* `libs/three.module.min.js` liegt nicht im Projekt (kein Internet bei der Entwicklung). Ohne die Datei lädt das Spiel
  Three.js vom CDN; für Offline/Android muss der Nutzer die Datei einmal ablegen (siehe `README.md`).
* Beim Öffnen von `index.html` direkt aus dem Dateimanager funktioniert nichts (Module brauchen eine Web-Adresse).
