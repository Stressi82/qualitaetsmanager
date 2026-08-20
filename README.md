# Qualitätsmanager-Lernplattform

Öffentliche Lernplattform mit Cloudflare Worker, D1-Datenbank und verschlüsselter Lernstands-Synchronisation.

## Sicherheit

- Passwörter werden mit PBKDF2-SHA-256 und individuellem Salt gehasht.
- Lernstände werden bereits im Browser mit AES-GCM verschlüsselt; der Server speichert nur Chiffretext.
- Das JWT-Geheimnis wird als Cloudflare-Secret gesetzt und niemals in Git eingecheckt.

## Bereitstellung

1. D1-Datenbank `qualitaetsmanager` erstellen.
2. `database_id` in `wrangler.jsonc` einsetzen.
3. `schema.sql` auf die D1-Datenbank anwenden.
4. Secret `JWT_SECRET` setzen.
5. Worker deployen oder das Repository mit Cloudflare Workers Builds verbinden.

Die Routen `/.netlify/identity/*`, `/.netlify/functions/account-access` und
`/.netlify/functions/account-sync` bleiben aus Kompatibilitätsgründen erhalten.
