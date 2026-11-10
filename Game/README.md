# Verlies – 3D-Abenteuer (Phase 1: Die Zelle)

Ein 3D-Spiel für das Smartphone (Three.js, HTML, CSS, JavaScript). Du erwachst in einer mittelalterlichen
Gefängniszelle und kannst dich frei bewegen.

**Enthalten:** 3D-Zelle mit symmetrischen Wänden · Ich-Perspektive mit sichtbaren Armen und Händen ·
dynamischer Joystick · Kamera per Wischen · Gehen · Sprinten · Springen · Physik und Kollisionen ·
**ein Gefängniswärter, der nach 15 Sekunden Spielzeit an die Gittertür kommt und mit dir spricht, Schlafen im Bett Morgenlicht in der Zelle und Abholen am Morgen.**
**Noch nicht enthalten:** Monster, Waffen, Inventar, Quests, Ton (kommen in späteren Phasen).

## Der Wärter

* Nach **15 Sekunden Spielzeit** öffnet sich am Ende des Gangs die Holztür. Der Wärter geht zur Gittertür
  (ca. 4 Sekunden später beginnt er zu sprechen). Pausen in den Einstellungen zählen nicht mit.
* Er sagt dir: **Morgen früh ist deine Hinrichtung, es gibt keinen Ausweg, und du sollst jetzt schlafen**, um am Tag der
  Hinrichtung bei Kräften zu sein. Du kannst dazwischen antworten (das ändert nur den Ton, nicht den Inhalt).
* Während des Gesprächs steuert sich die Spielfigur nicht selbst: Die Kamera dreht sich zum Wärter, Joystick und
  Buttons verschwinden. **Tippen** irgendwo zeigt den Text sofort ganz bzw. geht weiter, bei den Antworten tippst du auf
  den Knopf deiner Wahl.
* Danach dreht er sich um, geht zurück, die Tür schließt sich.
* **Schlafen:** Es erscheint der Hinweis „Du solltest jetzt schlafen. Geh zum Bett.“ Gehst du zum Bett (links hinten), erscheint
  der Knopf **Schlafen**. Du legst dich hin, das Bild wird schwarz („Die Nacht vergeht …“), dann öffnest du die Augen: **Das
  Morgenlicht scheint durchs Fenster in die Zelle**, die Gitterstäbe werfen Streifen auf den Boden, und der ganze Raum ist
  heller. Du stehst neben dem Bett auf und kannst dich wieder frei bewegen. Das geht einmal pro Spielstart.
* **Abholen:** Etwa 6 Sekunden nach dem Aufstehen öffnet sich die Tür am Gangende, der Wärter kommt zurück, schließt die
  Zellentür auf (das Gitter schwingt auf) und sagt: „Die Sonne ist aufgegangen. Es ist so weit.“ Danach geht er voraus, und du
  folgst ihm automatisch durch den Gang. Das Bild wird schwarz, und die Endkarte „Ende von Kapitel 1“ erscheint. Mit
  **Von vorn beginnen** startest du neu.
* Den Text findest du in `js/dialogue.js`, die Wartezeit (`triggerAfter`) in `js/guard-event.js`.

## Steuerung

| Aktion | Bedienung |
|---|---|
| Gehen | Linke Bildschirmhälfte berühren und ziehen (der Joystick erscheint unter dem Finger) |
| Umsehen | Rechte Bildschirmhälfte wischen |
| Springen | Button „Sprung" antippen (nur vom Boden aus) |
| Sprinten | Button „Sprint" gedrückt halten (Arme schwingen stärker, Hände ballen sich) |
| Einstellungen | Regler-Symbol oben rechts: Kamera-Empfindlichkeit, Helligkeit, Blick umkehren, Vollbild |

Zum Testen am Computer: WASD/Pfeiltasten, Leertaste (Sprung), Shift (Sprint), Maus ziehen (links = Joystick, rechts = Umsehen).

## Three.js lokal ablegen (einmalig, empfohlen)

Das Spiel braucht die 3D-Bibliothek Three.js in Version 0.170.0. Sie liegt nicht im ZIP.

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

1. ZIP entpacken. Der Inhalt des Ordners `Game` kommt in dein Repository (bzw. in deinen Spiel-Ordner), sodass
   `index.html` direkt darin liegt und **alle Ordner erhalten bleiben** (`js`, `libs`, `assets`, …).
2. **Hast du eine frühere Version schon online?** Dann alles überschreiben. Falls dort noch Dateien mit der Endung
   `.mjs` liegen (`main.mjs`, `js/*.mjs`), werden sie nicht mehr gebraucht und können gelöscht werden.
3. Auf GitHub: Repository → **Settings** → **Pages** → „Deploy from a branch" → Branch `main` → Save.
4. Die Adresse im Handy-Browser (Chrome) öffnen, **Spiel starten** tippen. Nach einem Update die Seite neu laden
   (Browser-Cache).
5. Optional: Chrome-Menü → „Zum Startbildschirm hinzufügen" legt ein App-Symbol an.

Das Spiel funktioniert nicht, wenn man `index.html` direkt aus dem Dateimanager öffnet (Browser blockieren dann
Module). Es muss über eine Adresse laufen (GitHub Pages oder lokaler Server).

## Lokal am Computer starten

```
cd Game
python3 -m http.server 8080      # oder: npm start
```
Dann `http://localhost:8080` im Browser öffnen. Tests: `npm test`.

## Als Android-App verpacken (später, mit Capacitor)

Voraussetzungen: Computer (oder Cloud-Build) mit Node.js und Android Studio. Die Datei
`libs/three.module.min.js` muss vorhanden sein (siehe oben).

```
npm run prepare-web          # kopiert alles nach "www"
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
npx cap open android         # in Android Studio: Build → Build APK(s)
```

* In `capacitor.config.json` die `appId` (z. B. `de.deinname.verlies`) anpassen, bevor du `cap add android` ausführst.
* Dieser Weg wurde bisher **nicht** ausprobiert.

## Projektstruktur

```
index.html, style.css, main.js   Seite, Oberfläche, Start und Hauptschleife
manifest.json                    Angaben für „Zum Startbildschirm hinzufügen"
js/                              Spiel-Module (Laden, Maße, Physik, Steuerung, Texturen, Welt, Arme)
libs/                            hier liegt three.module.min.js (siehe oben)
assets/icons/                    App-Symbole
scripts/prepare-web.js           bereitet den Ordner "www" für die Android-App vor
tests/                           automatische Prüfungen
ENTWICKLUNG.md                   Projektbeschreibung für die Weiterentwicklung (Aufbau, Entscheidungen, Teststand)
```

Es gibt keine Ordner `models` und `textures`: Möbel werden aus einfachen Formen im Code gebaut und alle
Texturen beim Start erzeugt. Dadurch kann keine Datei fehlen.

## Anpassen

* **Zu dunkel/hell:** im Spiel Einstellungen → Helligkeit. Dauerhaft: oben in `js/world.js` die Werte
  `TORCH_INTENSITY` und `AMBIENT_INTENSITY`.
* **Lauf-/Sprintgeschwindigkeit, Sprunghöhe:** oben in `js/physics.js` (`PLAYER`).
* **Zu langsam auf dem Gerät:** Das Spiel senkt die Auflösung automatisch. Zusätzlich kann in `main.js`
  `Math.min(dpr, 1.75)` kleiner gewählt werden.
