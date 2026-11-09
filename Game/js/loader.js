// loader.js – lädt Three.js.
// 1. Zuerst die lokale Kopie  libs/three.module.min.js  (funktioniert offline und in der Android-App).
// 2. Falls sie fehlt: dieselbe feste Version vom CDN (nur mit Internet).
// Die Version ist absichtlich festgenagelt, damit sich das Spiel nicht von selbst verändert.

export const THREE_VERSION = '0.170.0';

const LOCAL_URL = new URL('../libs/three.module.min.js', import.meta.url).href;
const CDN_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`;

export async function loadThree() {
  try {
    return { THREE: await import(LOCAL_URL), source: 'lokal' };
  } catch (localError) {
    console.warn('Lokale Three.js-Datei nicht gefunden, versuche CDN …', localError);
  }
  try {
    return { THREE: await import(CDN_URL), source: 'online' };
  } catch (cdnError) {
    const err = new Error('Three.js konnte weder lokal noch online geladen werden.');
    err.code = 'NO_THREE';
    err.cause = cdnError;
    throw err;
  }
}
