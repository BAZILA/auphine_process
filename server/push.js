'use strict';
// Notifications Web Push sans dépendance :
//   - chiffrement du contenu « aes128gcm » (RFC 8291)
//   - authentification du serveur VAPID (RFC 8292)
const crypto = require('node:crypto');
const https = require('node:https');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

// Seuls les services de push officiels des navigateurs sont acceptés (évite d'envoyer
// des requêtes vers n'importe quelle adresse fournie par un client).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

function isValidEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

function createVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  return { publicKey: b64u(publicKey), privateJwk: jwk };
}

/** En-tête Authorization VAPID : un JWT ES256 signé par la clé du serveur. */
function vapidAuthorization(endpoint, keys, subject) {
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  }));
  const key = crypto.createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${payload}.${b64u(signature)}, k=${keys.publicKey}`;
}

/** Chiffre `plaintext` pour un abonnement (clés p256dh et auth du navigateur). */
function encrypt(plaintext, p256dh, authSecret) {
  const uaPublic = fromB64u(p256dh);
  const auth = fromB64u(authSecret);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, auth, keyInfo, 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const record = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), // 0x02 = dernier enregistrement
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16); // taille d'enregistrement
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, record]);
}

function sendOne(sub, payload, keys, subject, { ttl = 86400, urgency = 'normal' } = {}) {
  return new Promise((resolve) => {
    const body = encrypt(JSON.stringify(payload), sub.p256dh, sub.auth);
    const req = https.request(sub.endpoint, {
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': body.length,
        TTL: String(ttl),
        Urgency: urgency,
        Authorization: vapidAuthorization(sub.endpoint, keys, subject),
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(0));
    req.end(body);
  });
}

function createPush(db, { subject }) {
  let keys = null;
  const row = db.get("SELECT value FROM settings WHERE key = 'vapid'");
  if (row) keys = JSON.parse(row.value);
  if (!keys) {
    keys = createVapidKeys();
    db.run("INSERT INTO settings (key, value) VALUES ('vapid', ?)", JSON.stringify(keys));
  }

  /**
   * Envoie une notification à tous les appareils de l'utilisateur.
   * `pref` : catégorie que l'utilisateur peut désactiver dans son profil.
   */
  async function notify(userId, payload, pref) {
    const user = db.get('SELECT notif_prefs FROM users WHERE id = ?', userId);
    if (!user) return 0;
    const prefs = JSON.parse(user.notif_prefs || '{}');
    if (pref && prefs[pref] === false) return 0;
    const subs = db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', userId);
    const codes = await Promise.all(subs.map(async (s) => {
      const code = await sendOne(s, payload, keys, subject);
      // 404 / 410 : l'abonnement n'existe plus côté navigateur.
      if (code === 404 || code === 410) db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', s.endpoint);
      return code;
    }));
    return codes.filter((c) => c >= 200 && c < 300).length;
  }

  return { publicKey: keys.publicKey, notify };
}

module.exports = { createPush, isValidEndpoint, encrypt, vapidAuthorization, createVapidKeys };
