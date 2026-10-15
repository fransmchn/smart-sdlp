# SMART BRMP SDLP — VPS Deployment Runbook

Dokumen ini untuk deployment pertama ke Ubuntu/Debian VPS. Jalankan sebagai checklist berurutan. Ganti semua nilai dalam `<...>` sebelum menjalankan command.

## 0. Nilai deployment

Isi catatan ini sebelum mulai:

```text
DOMAIN=<app.example.com>
REPO_URL=<repository-url>
APP_DIR=/var/www/smart-sdlp
APP_USER=smart-sdlp
DB_NAME=smart_sdlp
DB_USER=smart_sdlp_app
DB_HOST=127.0.0.1
BACKUP_DIR=/var/backups/smart-sdlp
```

Target architecture:

```text
Internet → Nginx :443 → Next.js 127.0.0.1:3000 → PostgreSQL 127.0.0.1:5432
```

Existing deployment drafts:

```text
deploy/nginx/smart-sdlp.conf
deploy/systemd/smart-sdlp.service
.env.production.example
```

---

## 1. Initial VPS setup

### 1.1 Login as root and update OS

```bash
ssh root@<VPS_IP>
apt update
apt full-upgrade -y
apt install -y ca-certificates curl git unzip build-essential
```

Reboot if kernel or core services were updated:

```bash
reboot
```

Reconnect as root after reboot.

### 1.2 Create non-root application user

```bash
adduser --disabled-password --gecos "" smart-sdlp
usermod -aG www-data smart-sdlp
```

Copy the deployer's SSH key. Run from local machine:

```bash
ssh-copy-id smart-sdlp@<VPS_IP>
```

Test non-root login before disabling root SSH access:

```bash
ssh smart-sdlp@<VPS_IP>
```

Do not disable root/password SSH until key login works.

### 1.3 Configure firewall

Install and configure UFW. Existing SSH connection must be open before enabling it.

```bash
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP for Certbot and redirect'
ufw allow 443/tcp comment 'HTTPS'
ufw enable
ufw status verbose
```

Expected inbound ports: `22`, `80`, `443` only. Never expose PostgreSQL port `5432` publicly.

Optional SSH hardening after key login is confirmed:

```bash
install -m 0644 /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sshd -t
systemctl reload ssh
```

Keep current SSH session open. Test a second session before closing it.

### 1.4 Install fail2ban (recommended)

```bash
apt install -y fail2ban
systemctl enable --now fail2ban
fail2ban-client status
fail2ban-client status sshd
```

If the SSH jail is not enabled, create `/etc/fail2ban/jail.d/sshd.local`:

```ini
[sshd]
enabled = true
port = ssh
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
```

Then apply:

```bash
systemctl restart fail2ban
fail2ban-client status sshd
```

---

## 2. Install dependencies

### 2.1 Install Bun for application user

Run as `smart-sdlp`, not root:

```bash
su - smart-sdlp
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

Record Bun version. Project declares:

```text
packageManager: bun@1.3.6
```

Use Bun `1.3.6` or a tested compatible release.

### 2.2 Install PostgreSQL, Nginx, Certbot

Run as root:

```bash
exit
apt install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx
systemctl enable --now postgresql
systemctl enable --now nginx
psql --version
nginx -v
certbot --version
```

PostgreSQL version must be a supported PostgreSQL release for the installed Prisma 7 client. PostgreSQL 14+ is recommended. Keep the OS package version unless compatibility testing requires otherwise.

---

## 3. Configure local PostgreSQL

### 3.1 Create restricted database user and database

Generate a strong password outside shell history. Use a password manager. Then run:

```bash
sudo -u postgres psql
```

Inside `psql`:

```sql
CREATE ROLE smart_sdlp_app LOGIN PASSWORD '<DB_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE smart_sdlp OWNER smart_sdlp_app;
REVOKE ALL ON DATABASE smart_sdlp FROM PUBLIC;
GRANT CONNECT ON DATABASE smart_sdlp TO smart_sdlp_app;
\q
```

The application role is not a superuser and has no database/role creation privilege. Database ownership is needed for Prisma migrations; do not use `postgres` in the application `.env.production`.

### 3.2 Local connection string

For PostgreSQL on the same VPS, use loopback and no remote Supabase SSL requirement:

```env
DATABASE_URL="postgresql://smart_sdlp_app:<URL_ENCODED_DB_PASSWORD>@127.0.0.1:5432/smart_sdlp?sslmode=disable"
```

Use `sslmode=prefer` instead if local PostgreSQL is configured with TLS:

```env
DATABASE_URL="postgresql://smart_sdlp_app:<URL_ENCODED_DB_PASSWORD>@127.0.0.1:5432/smart_sdlp?sslmode=prefer"
```

URL-encode reserved password characters such as `@`, `:`, `/`, `#`, and `%`.

Verify local connection:

```bash
sudo -u postgres psql -d smart_sdlp -c 'SELECT current_database(), current_user;'
psql "postgresql://smart_sdlp_app:<URL_ENCODED_DB_PASSWORD>@127.0.0.1:5432/smart_sdlp?sslmode=disable" -c 'SELECT 1;'
```

---

## 4. Clone and configure application

### 4.1 Clone repository

```bash
su - smart-sdlp
mkdir -p /var/www
cd /var/www
git clone <REPO_URL> smart-sdlp
cd /var/www/smart-sdlp
```

Use the intended production branch/tag, not an unreviewed development branch:

```bash
git checkout <PRODUCTION_BRANCH_OR_TAG>
```

### 4.2 Install dependencies and generate Prisma client

```bash
bun install --frozen-lockfile
bunx prisma generate
```

### 4.3 Create production environment file

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Required production values:

```env
DATABASE_URL="postgresql://smart_sdlp_app:<URL_ENCODED_DB_PASSWORD>@127.0.0.1:5432/smart_sdlp?sslmode=disable"
BETTER_AUTH_SECRET="<long-random-secret-at-least-32-bytes>"
BETTER_AUTH_URL="https://<DOMAIN>"
NEXT_PUBLIC_BETTER_AUTH_URL="https://<DOMAIN>"
SMTP_HOST="<SMTP_HOST>"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="<SMTP_USER>"
SMTP_PASSWORD="<SMTP_PASSWORD>"
SMTP_FROM="<verified-sender>"
GOOGLE_CLIENT_EMAIL="<service-account-email>"
GOOGLE_PRIVATE_KEY="<private-key-with-escaped-newlines>"
GOOGLE_DRIVE_FOLDER_ID="<folder-id>"
NODE_ENV="production"
```

Do not copy development `.env` to production. Confirm no placeholder remains:

```bash
grep -nE 'replace-me|your-|example\.com|USER:PASSWORD|<DOMAIN>' .env.production || true
```

### 4.4 Apply migrations

Do not use `prisma db push` on VPS.

```bash
bunx prisma migrate deploy
bunx prisma migrate status
```

Expected result: all migrations applied and database schema up to date.

### 4.5 Bootstrap first admin

`prisma/bootstrap-admin.ts` creates the initial administrator user securely.
It reads the credentials from environment variables `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.
- Both variables are required and have no default values.
- `BOOTSTRAP_ADMIN_PASSWORD` must be at least 12 characters long.
- The created administrator account is automatically assigned `mustChangePassword = true`, requiring a password change upon first login.

Run only once during initial setup:

```bash
export BOOTSTRAP_ADMIN_EMAIL="<ADMIN_EMAIL>"
export BOOTSTRAP_ADMIN_PASSWORD="<STRONG_PASSWORD_MIN_12_CHARS>"
bun run prisma/bootstrap-admin.ts
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
```

On PowerShell:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "<ADMIN_EMAIL>"
$env:BOOTSTRAP_ADMIN_PASSWORD = "<STRONG_PASSWORD_MIN_12_CHARS>"
bun run prisma/bootstrap-admin.ts
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

1. Log in immediately at `/login` with the bootstrap credentials.
2. The system forces an immediate password change via `/account/change-password`.
3. Do not run again if the admin email already exists; the script intentionally stops.

---

## 5. Build and install systemd service

### 5.1 Production build

```bash
cd /var/www/smart-sdlp
bun run build
```

Build must finish without errors before service installation.

### 5.2 Install service draft

Run as root:

```bash
exit
install -o root -g root -m 0644 /var/www/smart-sdlp/deploy/systemd/smart-sdlp.service /etc/systemd/system/smart-sdlp.service
systemctl daemon-reload
systemctl enable smart-sdlp
systemctl start smart-sdlp
systemctl status smart-sdlp --no-pager
```

The draft expects:

```text
User=smart-sdlp
WorkingDirectory=/var/www/smart-sdlp
EnvironmentFile=/var/www/smart-sdlp/.env.production
ExecStart=/usr/bin/env bun run start
```

Confirm Bun path if service fails:

```bash
su - smart-sdlp -c 'command -v bun'
```

If Bun is under the user's home directory, replace `ExecStart` with its absolute path or provide a system-wide Bun installation. Do not use an interactive shell startup file in systemd.

Check application locally:

```bash
curl -I http://127.0.0.1:3000/login
journalctl -u smart-sdlp -n 100 --no-pager
```

Expected login response: HTTP `200`.

---

## 6. Configure Nginx and HTTPS

### 6.1 Prepare DNS

Point these DNS records to the VPS public IP:

```text
A     <DOMAIN>       <VPS_IP>
A     www.<DOMAIN>   <VPS_IP>   # only if www is used
```

Wait until DNS resolves:

```bash
getent hosts <DOMAIN>
```

### 6.2 Install Nginx draft

The existing draft is `deploy/nginx/smart-sdlp.conf`. Replace every `example.com` with the real domain before copying.

```bash
sed 's/example.com/<DOMAIN>/g' /var/www/smart-sdlp/deploy/nginx/smart-sdlp.conf > /etc/nginx/sites-available/smart-sdlp
ln -s /etc/nginx/sites-available/smart-sdlp /etc/nginx/sites-enabled/smart-sdlp
rm -f /etc/nginx/sites-enabled/default
```

Before certificates exist, temporarily keep only the HTTP server block or let Certbot install certificate directives. Validate:

```bash
nginx -t
systemctl reload nginx
curl -I http://<DOMAIN>
```

### 6.3 Obtain Let's Encrypt certificate

```bash
certbot --nginx -d <DOMAIN> -d www.<DOMAIN>
```

Choose HTTP-to-HTTPS redirect when prompted. If `www` DNS is not configured, request only `<DOMAIN>`.

Validate:

```bash
nginx -t
systemctl reload nginx
curl -I http://<DOMAIN>
curl -I https://<DOMAIN>/login
certbot renew --dry-run
```

Expected:

- HTTP returns `301` or `308` to HTTPS.
- HTTPS `/login` returns `200`.
- Certbot dry run succeeds.

Update `.env.production` if needed, then restart the app:

```bash
systemctl restart smart-sdlp
```

---

## 7. Final pre-live verification

Record each result. Do not declare live while any required check fails.

### Infrastructure

- [ ] `systemctl is-active postgresql` returns `active`.
- [ ] `systemctl is-active smart-sdlp` returns `active`.
- [ ] `systemctl is-active nginx` returns `active`.
- [ ] `ufw status` allows only `22/tcp`, `80/tcp`, `443/tcp` inbound.
- [ ] PostgreSQL is not reachable from the public internet.
- [ ] `certbot renew --dry-run` succeeds.
- [ ] Reboot test completed or scheduled maintenance window approved.

### HTTP and security

- [ ] `http://<DOMAIN>` redirects to HTTPS.
- [ ] `https://<DOMAIN>/login` returns `200`.
- [ ] `https://<DOMAIN>/robots.txt` returns:
  ```text
  User-agent: *
  Disallow: /
  ```
- [ ] Response includes noindex metadata on HTML pages.
- [ ] No production stack trace or database error is visible to users.
- [ ] Browser certificate is valid and domain matches.

### Authentication and authorization

- [ ] Admin login succeeds.
- [ ] Wrong password fails without exposing internal error details.
- [ ] Logout invalidates the session.
- [ ] Normal user login succeeds.
- [ ] Admin-only route rejects normal user.
- [ ] Normal user cannot access admin route.
- [ ] `mustChangePassword` redirect works for a test account.
- [ ] Password change succeeds and user can log in with the new password.
- [ ] Forgot-password request works.
- [ ] Reset email arrives.
- [ ] Reset link opens and password reset succeeds.
- [ ] Reset token expiry and invalid token show safe errors.
- [ ] Login/reset rate limits return controlled responses.

### Business flows

- [ ] Admin creates/edits/deactivates a user.
- [ ] Admin creates and edits a program category.
- [ ] Admin creates a kegiatan.
- [ ] User sees assigned kegiatan.
- [ ] User submits a laporan.
- [ ] Pagu validation prevents realization above budget.
- [ ] Admin reviews and deletes/rejects a laporan.
- [ ] Audit log records relevant mutations.
- [ ] Reminder email sends successfully.
- [ ] Delete/reject notification email sends successfully.
- [ ] Email logo and HTML render correctly.
- [ ] Document upload to Google Drive works, if configured.
- [ ] Document download/delete works.
- [ ] Excel export opens and formulas are not executable.
- [ ] Print preview and PDF/print layout are correct.
- [ ] `/tentang` is accessible only after login.

### Observability

```bash
journalctl -u smart-sdlp -f
journalctl -u nginx -f
```

Confirm logs contain no repeated crash, database connection failure, SMTP failure, or unhandled exception.

---

## 8. Automated PostgreSQL backups

### 8.1 Create backup directory and script

Run as root:

```bash
mkdir -p /var/backups/smart-sdlp
chown smart-sdlp:smart-sdlp /var/backups/smart-sdlp
chmod 700 /var/backups/smart-sdlp
install -o root -g root -m 0750 /dev/null /usr/local/sbin/backup-smart-sdlp.sh
nano /usr/local/sbin/backup-smart-sdlp.sh
```

Use this script, replacing `<DB_PASSWORD>` securely. Prefer a `.pgpass` file over putting passwords in this script.

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="/var/backups/smart-sdlp"
DB_NAME="smart_sdlp"
DB_USER="smart_sdlp_app"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
FILE="$BACKUP_DIR/${DB_NAME}_${STAMP}.dump"

umask 077
pg_dump --format=custom --file="$FILE" --host=127.0.0.1 --username="$DB_USER" "$DB_NAME"
find "$BACKUP_DIR" -type f -name "${DB_NAME}_*.dump" -mtime +14 -delete
sha256sum "$FILE" > "$FILE.sha256"
```

Set up `.pgpass` for the backup identity if needed:

```bash
install -m 0600 -o root -g root /dev/null /root/.pgpass
printf '127.0.0.1:5432:smart_sdlp:smart_sdlp_app:<DB_PASSWORD>\n' >> /root/.pgpass
chmod 600 /root/.pgpass
```

Test manually:

```bash
/usr/local/sbin/backup-smart-sdlp.sh
ls -lh /var/backups/smart-sdlp
```

Test restore into a separate temporary database, never production:

```bash
sudo -u postgres createdb smart_sdlp_restore_test
sudo -u postgres pg_restore --clean --if-exists --dbname=smart_sdlp_restore_test /var/backups/smart-sdlp/<BACKUP_FILE>.dump
sudo -u postgres dropdb smart_sdlp_restore_test
```

### 8.2 Schedule daily backup and retention

Create `/etc/cron.d/smart-sdlp-backup`:

```cron
15 2 * * * root /usr/local/sbin/backup-smart-sdlp.sh >> /var/log/smart-sdlp-backup.log 2>&1
```

Retention baseline: keep 14 daily backups locally. Adjust to policy.

### 8.3 Copy backups off VPS

Local backups do not protect against VPS loss. Configure an approved offsite target such as S3-compatible storage, object storage, or another secured server. Upload encrypted backup files after each successful dump, for example using a provider-approved CLI or `rclone`:

```bash
rclone copy /var/backups/smart-sdlp <REMOTE_NAME>:<REMOTE_BUCKET>/smart-sdlp/ --include '*.dump' --include '*.sha256'
```

Use a dedicated storage credential with write-only or restricted backup permissions. Do not store that credential in the repository. Test offsite download and restore at least monthly.

---

## 9. Rollback and incident notes

Application rollback:

```bash
cd /var/www/smart-sdlp
git checkout <KNOWN_GOOD_TAG>
bun install --frozen-lockfile
bunx prisma migrate deploy
bun run build
systemctl restart smart-sdlp
```

Never roll back schema by deleting tables or running `prisma migrate reset` in production. Prisma migrations are forward-only; prepare a corrective migration for schema rollback.

Application logs:

```bash
journalctl -u smart-sdlp --since '1 hour ago' --no-pager
```

Nginx logs:

```bash
tail -n 200 /var/log/nginx/access.log
 tail -n 200 /var/log/nginx/error.log
```

If database integrity is in doubt: stop write traffic, preserve logs, take a fresh dump, and use the restore procedure on an isolated database before any production recovery action.
