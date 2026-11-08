# Verlies – 3D-Abenteuer (Phase 1: Die Zelle)

Ein 3D-Spiel für das Smartphone (Three.js, HTML, CSS, JavaScript). Du erwachst in einer mittelalterlichen
Gefängniszelle und kannst dich frei bewegen.

**Enthalten in Phase 1:** 3D-Zelle · Ich-Perspektive · dynamischer Joystick · Kamera per Wischen ·
Gehen · Sprinten · Springen · Physik und Kollisionen.
**Noch nicht enthalten:** Monster, Waffen, Inventar, Quests (kommen in späteren Phasen).

## Steuerung

| Aktion | Bedienung |
|---|---|
| Gehen | Linke Bildschirmhälfte berühren und ziehen (der Joystick erscheint unter dem Finger) |
| Umsehen | Rechte Bildschirmhälfte wischen |
| Springen | Button „Sprung" antippen (nur vom Boden aus) |
| Sprinten | Button „Sprint" gedrückt halten |
| Einstellungen | Regler-Symbol oben rechts: Kamera-Empfindlichkeit, Helligkeit, Blick umkehren, Vollbild |

Zum Testen am Computer: WASD/Pfeiltasten, Leertaste (Sprung), Shift (Sprint), Maus ziehen (links = Joystick, rechts = Umsehen).

## WICHTIG: Three.js lokal ablegen (einmalig)

Das Spiel braucht die 3D-Bibliothek Three.js in Version 0.170.0. Sie konnte nicht direkt in dieses ZIP gelegt
werden. Deshalb gilt:

* **Ohne die Datei** lädt das Spiel Three.js automatisch aus dem Internet. Das reicht zum Ausprobieren.
* **Mit der Datei** läuft das Spiel auch ohne Internet, und die Android-App funktioniert später ohne Netz.

So legst du die Datei ab:

1. Auf dem Smartphone diese Adresse öffnen:
   `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js`
2. Die Seite als Datei speichern (Browser-Menü „Herunterladen" bzw. „Seite speichern") und sie genau
   `three.module.min.js` nennen.
3. Die Datei in den Ordner `libs` deines GitHub-Projekts hochladen.

Auf dem Startbildschirm steht unten klein, ob Three.js „lokal" oder „online" geladen wurde.

## Auf GitHub hochladen und spielen

1. ZIP entpacken. Der Inhalt des Ordners `Game` kommt in dein Repository, sodass `index.html`
   **ganz oben** im Repository liegt (nicht in einem Unterordner) und die Ordner `js`, `libs`, `assets`
   erhalten bleiben.
2. Auf GitHub: Repository → **Settings** → **Pages** → „Deploy from a branch" → Branch `main`, Ordner `/ (root)` → Save.
3. Nach ein bis zwei Minuten steht dort die Adresse (`https://DEINNAME.github.io/REPOSITORY/`). Diese im
   Handy-Browser (Chrome) öffnen, **Spiel starten** tippen.
4. Optional: Chrome-Menü → „Zum Startbildschirm hinzufügen" legt ein App-Symbol an.

Hinweis: Das Spiel funktioniert nicht, wenn man `index.html` direkt aus dem Dateimanager öffnet. Browser
erlauben dabei keine Spielmodule. Es muss über eine Adresse (GitHub Pages oder lokaler Server) laufen.

## Lokal am Computer starten

```
cd Game
python3 -m http.server 8080
```
Dann `http://localhost:8080` im Browser öffnen. (Alternativ: `npx serve`.)

## Als Android-App verpacken (später, mit Capacitor)

Voraussetzungen: Computer (oder Cloud-Build) mit Node.js und Android Studio. Die Datei
`libs/three.module.min.js` muss vorhanden sein (siehe oben).

```
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run prepare-web          # kopiert alles nach "www"
npx cap add android
npx cap sync android
npx cap open android         # in Android Studio: Build → Build APK(s)
```

* In `capacitor.config.json` die `appId` (z. B. `de.deinname.verlies`) anpassen, bevor du `cap add android` ausführst.
* Dieser Weg wurde in Phase 1 **nicht** ausprobiert. Wenn du die APK ohne Computer bauen möchtest, kann in
  einer späteren Phase eine automatische Cloud-Erstellung über GitHub Actions ergänzt werden.

## Hinweis zu den Dateiendungen

Alle Programmdateien enden auf `.mjs` statt `.js`. Es ist dieselbe Sprache und läuft im Browser genauso.
Der Grund: Mail-Programme (z. B. Gmail, Outlook) blockieren ZIP-Dateien mit `.js`-Dateien. Bitte die
Endungen nicht ändern.

## Projektstruktur

```
index.html, style.css, main.mjs  Seite, Oberfläche, Start und Hauptschleife
manifest.json                    Angaben für „Zum Startbildschirm hinzufügen"
js/loader.mjs                     lädt Three.js (lokal, sonst online)
js/layout.mjs                     Maße der Zelle und aller Hindernisse (gemeinsam für Optik und Physik)
js/world.mjs                      baut Zelle, Möbel, Gittertür, Fackel, Licht
js/textures.mjs                   erzeugt alle Texturen per Code (keine Bilddateien nötig)
js/physics.mjs                    Bewegung, Schwerkraft, Sprung, Kollisionen
js/controls.mjs                   Joystick, Wischen, Buttons
libs/                            hier liegt three.module.min.js
assets/icons/                    App-Symbole
scripts/prepare-web.mjs          bereitet den Ordner "www" für die Android-App vor
tests/                           automatische Prüfungen (Physik, Touch, Aufbau)
```

Es gibt keine Ordner `models` und `textures`: Alle Möbel werden aus einfachen Formen im Code gebaut und alle
Texturen beim Start erzeugt. Dadurch kann keine Datei fehlen. Für spätere Phasen (Figuren, Waffen) werden
passende Ordner ergänzt.

## Anpassen

* **Zu dunkel/hell:** im Spiel Einstellungen → Helligkeit. Dauerhaft: oben in `js/world.mjs` die Werte
  `TORCH_INTENSITY` und `AMBIENT_INTENSITY`.
* **Lauf-/Sprintgeschwindigkeit, Sprunghöhe:** oben in `js/physics.mjs` (`PLAYER`).
* **Zu langsam auf dem Gerät:** Das Spiel senkt die Auflösung automatisch. Zusätzlich kann in `main.mjs`
  `Math.min(dpr, 1.75)` kleiner gewählt werden.

## Automatische Tests (optional, am Computer)

```
npm test
```
Prüft Physik (Wände, Ecken, Tür, Möbel, Springen), Touch-Logik und den Aufbau-Code. Ersetzt keinen Test auf dem Handy.
