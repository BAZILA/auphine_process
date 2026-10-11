// Client HTTP de l'API (jeton conservé dans le stockage local).
// Les lectures sont mises en cache : un écran déjà visité s'affiche instantanément,
// puis se met à jour en arrière-plan. Toute écriture vide le cache.
import { today } from './dates.js';

const TOKEN_KEY = 'auphine.token';
const TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
})();
// Version de l'interface chargée (injectée par le serveur dans la page).
const LOADED_BUILD = document.querySelector('meta[name="app-build"]')?.content || '';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token = readToken();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Cache des lectures --------------------------------------------------------
const cache = new Map();
let cacheMode = false;
let cacheHits = 0;
export const clearCache = () => cache.clear();
/** Active ou non la lecture depuis le cache ; renvoie le nombre de lectures servies par le cache depuis l'activation. */
export function useCache(on) {
  const hits = cacheHits;
  cacheMode = on;
  cacheHits = 0;
  return hits;
}

export function setToken(value) {
  token = value;
  cache.clear();
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* navigation privée : la session ne survivra pas au rechargement */ }
}

export const hasToken = () => Boolean(token);

let updateSignaled = false;
function checkVersion(res) {
  const served = res.headers.get('X-App-Version');
  if (!updateSignaled && served && LOADED_BUILD && !LOADED_BUILD.includes('{') && served !== LOADED_BUILD) {
    updateSignaled = true;
    window.dispatchEvent(new Event('app:update'));
  }
}

async function request(method, path, { json, blob } = {}) {
  const hadToken = Boolean(token);
  const headers = {
    // Jour et fuseau locaux : le serveur calcule « aujourd'hui » et l'heure des rappels comme toi.
    'X-Local-Day': today(),
    ...(TIMEZONE ? { 'X-Timezone': TIMEZONE } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (blob) headers['Content-Type'] = blob.type || 'application/octet-stream';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : blob,
    });
  } catch {
    throw new ApiError(0, 'Connexion impossible, vérifie ton réseau.');
  }
  checkVersion(res);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && hadToken) {
      setToken(null);
      window.dispatchEvent(new Event('auth:lost'));
    }
    throw new ApiError(res.status, data?.error || 'Erreur inattendue');
  }
  return res;
}

export async function api(method, path, body) {
  if (method !== 'GET') cache.clear();
  const res = await request(method, path, { json: body });
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function get(path) {
  if (cacheMode && cache.has(path)) {
    cacheHits++;
    return structuredClone(cache.get(path));
  }
  const data = await api('GET', path);
  cache.set(path, data);
  return structuredClone(data);
}

export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body = {}) => api('PUT', path, body);
export const patch = (path, body = {}) => api('PATCH', path, body);
export const del = (path) => api('DELETE', path);

/** Envoie un fichier brut (ex. photo). */
export async function upload(path, blob) {
  cache.clear();
  return (await request('PUT', path, { blob })).json();
}

// Les photos sont protégées par le jeton : on les télécharge puis on crée une URL locale.
const blobUrls = new Map();
export function blobUrl(path) {
  if (!blobUrls.has(path)) {
    blobUrls.set(path, request('GET', path)
      .then((res) => res.blob())
      .then((b) => URL.createObjectURL(b))
      .catch((err) => {
        blobUrls.delete(path);
        throw err;
      }));
  }
  return blobUrls.get(path);
}
