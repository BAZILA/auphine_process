# Déployer Auphine sur un VPS

Guide pour un VPS **Ubuntu 22.04 / 24.04 ou Debian 12** (OVH, Hetzner, Scaleway, DigitalOcean… le plus petit modèle suffit).

```
Internet ──HTTPS──> Caddy (ports 80/443) ──> Auphine (127.0.0.1:3210) ──> data/auphine.db
```

- **Caddy** obtient et renouvelle tout seul le certificat HTTPS.
- **systemd** démarre l'appli au boot et la relance si elle plante.

## 0. Prérequis

1. **Un nom de domaine** (ou sous-domaine) : crée un enregistrement DNS de type **A** `auphine.mondomaine.fr` qui pointe vers l'IP du VPS. Le HTTPS est indispensable pour installer l'appli sur un téléphone.
2. **Le code sur GitHub** (dépôt privé possible) pour pouvoir le récupérer sur le serveur avec `git clone`.

## 1. Préparer le serveur

Connecte-toi en SSH (`ssh root@IP_DU_VPS`, ou ton utilisateur avec `sudo`), puis :

```bash
# Mises à jour + outils
sudo apt update && sudo apt upgrade -y
sudo apt install -y git sqlite3 curl ufw

# Pare-feu : SSH, HTTP et HTTPS uniquement
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 2. Installer Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # doit afficher v22.13 ou plus
```

## 3. Installer l'application

```bash
# Utilisateur système dédié, sans connexion possible
sudo useradd --system --home-dir /opt/auphine --shell /usr/sbin/nologin auphine
sudo mkdir -p /opt/auphine && sudo chown auphine:auphine /opt/auphine

# Récupérer le code + dossier de la base
sudo -u auphine git clone https://github.com/TON_COMPTE/auphine_process.git /opt/auphine
sudo -u auphine mkdir -p /opt/auphine/data
```

> Dépôt privé : utilise l'URL avec un jeton GitHub en lecture seule (`https://<jeton>@github.com/...`) ou une *deploy key* (Settings → Deploy keys).

Il n'y a **rien à installer** (`npm install` n'est pas nécessaire : aucune dépendance).

## 4. Lancer le service

```bash
sudo cp /opt/auphine/deploy/auphine.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now auphine

# Vérifier
sudo systemctl status auphine
curl -I http://127.0.0.1:3210   # doit répondre « HTTP/1.1 200 OK »
```

Pour voir les journaux : `sudo journalctl -u auphine -f`

## 5. HTTPS avec Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /opt/auphine/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile      # remplace auphine.mondomaine.fr par ton domaine
sudo systemctl reload caddy
```

Ouvre `https://auphine.mondomaine.fr` : c'est en ligne 🎉. Sur ton téléphone, onglet **Profil → Installer l'application** (Android), ou **Partager → Sur l'écran d'accueil** (iPhone).

## 6. Sauvegardes automatiques

```bash
sudo cp /opt/auphine/deploy/backup.sh /usr/local/bin/auphine-backup
sudo chmod +x /usr/local/bin/auphine-backup
sudo auphine-backup && ls /var/backups/auphine    # test

# Tous les jours à 3 h
echo '0 3 * * * root /usr/local/bin/auphine-backup' | sudo tee /etc/cron.d/auphine-backup
```

Idéalement, copie aussi ces sauvegardes hors du VPS de temps en temps (`scp`, stockage objet…).

## Mettre à jour l'appli

Après avoir poussé tes modifications sur GitHub :

```bash
cd /opt/auphine && sudo -u auphine git pull --ff-only && sudo systemctl restart auphine
```

La base `data/` n'est pas dans Git : elle n'est jamais écrasée par une mise à jour.

## En cas de souci

| Symptôme | Piste |
|---|---|
| `502 Bad Gateway` | L'appli ne tourne pas : `sudo journalctl -u auphine -n 50` |
| Pas de certificat HTTPS | Le DNS ne pointe pas encore vers le VPS, ou les ports 80/443 sont fermés : `sudo journalctl -u caddy -n 50` |
| `Le port 3210 est déjà utilisé` | Change `PORT` dans le service **et** dans le Caddyfile |
| Erreur `node:sqlite` | Node est trop ancien : `node --version` doit afficher v22.13 ou plus |
