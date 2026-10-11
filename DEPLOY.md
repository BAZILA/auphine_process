# Déployer Auphine

Deux façons de faire selon ton serveur :

- **A. Serveur géré par un panneau** (CWP, cPanel, Plesk…) **sans droits administrateur** : c'est l'installation actuelle d'`auphine.lbcorporation.dev`.
- **B. VPS avec droits administrateur** (`sudo`) : systemd + Caddy.

Dans les deux cas, **le HTTPS est obligatoire** pour installer l'appli sur un téléphone et recevoir les notifications.

---

## Mettre à jour (installation A, la plus courante)

Après avoir poussé les modifications sur GitHub, sur le serveur :

```bash
cd ~/apps/auphine && git pull && pm2 restart auphine
```

- **Ne reclone jamais le projet** : la base (`data/auphine.db`) et les photos (`data/uploads/`) ne sont pas dans Git, et supprimer le dossier les effacerait.
- Les évolutions de la base (nouvelles colonnes, etc.) sont appliquées **automatiquement** au redémarrage.
- Pour vérifier que tout va bien : `pm2 logs auphine --lines 20 --nostream`.

---

## A. Serveur avec panneau, sans droits admin

Exemple réel : Rocky Linux + CWP, utilisateur `alpha`, domaine géré chez Hostinger.

### 1. Le sous-domaine
1. Dans le panneau, crée le sous-domaine (ex. `auphine.lbcorporation.dev`) : il crée un dossier web `~/auphine.lbcorporation.dev`.
2. Chez le gestionnaire DNS du domaine (ici Hostinger), ajoute un enregistrement **A** : nom `auphine`, valeur = IP du serveur.

### 2. Node.js (dans ton compte, sans sudo)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
```

### 3. Le code
⚠️ **Jamais dans le dossier web**, qui est public. On le met à part :
```bash
mkdir -p ~/apps && git clone https://github.com/BAZILA/auphine_process.git ~/apps/auphine
```

### 4. Lancer l'appli en permanence avec pm2
```bash
npm install -g pm2
cd ~/apps/auphine && HOST=127.0.0.1 TRUST_PROXY=1 pm2 start server/index.js --name auphine --node-args="--disable-warning=ExperimentalWarning"
pm2 save
(crontab -l 2>/dev/null; echo "@reboot $(which node) $(which pm2) resurrect") | crontab -
```
Vérification : `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3210/` doit afficher `200`.

### 5. Relier le domaine à l'appli (Apache)
Dans le dossier web du sous-domaine :
```bash
cat > ~/auphine.lbcorporation.dev/.htaccess <<'EOF'
DirectoryIndex disabled
RewriteEngine On
# Laisse passer la validation du certificat HTTPS
RewriteCond %{REQUEST_URI} !^/\.well-known/
# Les pages d'index par défaut d'Apache → page d'accueil de l'appli
RewriteRule ^(index\.(php|html?))?$ http://127.0.0.1:3210/ [P,L]
# Tout le reste est transmis à l'appli Node
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteRule ^(.*)$ http://127.0.0.1:3210/$1 [P,L]
EOF
```

### 6. HTTPS
Dans le panneau : **SSL / AutoSSL** → installe le certificat Let's Encrypt pour le sous-domaine.
Les domaines en `.dev` s'ouvrent **toujours** en HTTPS dans les navigateurs : avant le certificat, le site ne s'affiche pas, c'est normal.

### 7. Sauvegardes automatiques (base + photos, 14 jours gardés dans `~/backups/auphine`)
```bash
(crontab -l 2>/dev/null; echo "0 3 * * * $(which node) --disable-warning=ExperimentalWarning $HOME/apps/auphine/scripts/backup.js") | crontab -
```
Test immédiat : `cd ~/apps/auphine && npm run backup`.
Copie aussi ces sauvegardes hors du serveur de temps en temps.

---

## B. VPS avec droits administrateur (systemd + Caddy)

Pour Ubuntu / Debian.

```
Internet ──HTTPS──> Caddy (ports 80/443) ──> Auphine (127.0.0.1:3210) ──> data/
```

```bash
# Système, pare-feu, Node.js 22
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Utilisateur dédié + code
sudo useradd --system --home-dir /opt/auphine --shell /usr/sbin/nologin auphine
sudo mkdir -p /opt/auphine && sudo chown auphine:auphine /opt/auphine
sudo -u auphine git clone https://github.com/BAZILA/auphine_process.git /opt/auphine
sudo -u auphine mkdir -p /opt/auphine/data

# Service
sudo cp /opt/auphine/deploy/auphine.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now auphine

# Caddy (HTTPS automatique)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo cp /opt/auphine/deploy/Caddyfile /etc/caddy/Caddyfile   # puis remplace le domaine
sudo systemctl reload caddy

# Sauvegardes quotidiennes à 3 h
echo '0 3 * * * auphine BACKUP_DIR=/opt/auphine/backups /usr/bin/node --disable-warning=ExperimentalWarning /opt/auphine/scripts/backup.js' | sudo tee /etc/cron.d/auphine-backup
```

Mise à jour : `cd /opt/auphine && sudo -u auphine git pull --ff-only && sudo systemctl restart auphine`.
Journaux : `sudo journalctl -u auphine -f`.

---

## Notifications push

- Rien à installer : les clés de sécurité (VAPID) sont générées au premier démarrage et gardées dans la base.
- Variable facultative `VAPID_SUBJECT` : un contact (`mailto:toi@exemple.fr` ou une URL `https://…`) transmis aux services de notification.
- **iPhone** : les notifications ne marchent que si l'appli est **installée sur l'écran d'accueil** (iOS 16.4 ou plus récent).
- Rappels programmés : à **20 h** s'il reste des objectifs, et le **dimanche à 18 h** pour le bilan, à l'heure locale de chacun.

## En cas de souci

| Symptôme | Piste |
|---|---|
| `502` / `503` | L'appli ne tourne pas : `pm2 status` puis `pm2 logs auphine --lines 50 --nostream` |
| Page « Introuvable » à l'accueil | Le `.htaccess` n'a pas la ligne `DirectoryIndex disabled` |
| Pas de certificat HTTPS | Le DNS ne pointe pas encore vers le serveur |
| `Le port 3210 est déjà utilisé` | Lance avec un autre `PORT=` et mets le même port dans le `.htaccess` |
| Erreur `node:sqlite` | Node trop ancien : `node --version` doit afficher v22.13 ou plus |
| Photo refusée « trop volumineuse » | L'appli réduit les photos avant l'envoi ; au-delà de 4 Mo le serveur refuse |
