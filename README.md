# Qualitätsmanager-Lernplattform

Öffentliche Lernplattform mit Cloudflare Worker, D1-Datenbank und verschlüsselter Lernstands-Synchronisation.

## Sicherheit

- Passwörter werden mit PBKDF2-SHA-256 und individuellem Salt gehasht.
- Lernstände werden bereits im Browser mit AES-GCM verschlüsselt; der Server speichert nur Chiffretext.
- Große verschlüsselte Lernstände werden in D1 in kleine Datensätze aufgeteilt und transaktional gespeichert.
- Das JWT-Geheimnis wird als Cloudflare-Secret gesetzt und niemals in Git eingecheckt.

## Konten vom früheren System

Vorhandene verschlüsselte Lernstände können beim ersten Registrieren automatisch über die bisherige
E-Mail-Adresse zugeordnet werden. Damit der Browser den Lernstand entschlüsseln kann, muss dabei das
bisherige Passwort oder der persönliche Wiederherstellungscode verwendet werden. Passwörter selbst
werden nicht kopiert und liegen auch dem Betreiber nicht im Klartext vor.

## Bereitstellung

1. D1-Datenbank `qualitaetsmanager` erstellen.
2. `database_id` in `wrangler.jsonc` einsetzen.
3. `schema.sql` auf die D1-Datenbank anwenden.
4. Secret `JWT_SECRET` setzen.
5. Worker deployen oder das Repository mit Cloudflare Workers Builds verbinden.

Für die bereits laufende Datenbank wird einmalig
`migrations/0002_durable_account_recovery.sql` angewendet. Das Skript verändert keine
Passwörter und enthält keine persönlichen Kontodaten.

Die Routen `/.netlify/identity/*`, `/.netlify/functions/account-access` und
`/.netlify/functions/account-sync` bleiben aus Kompatibilitätsgründen erhalten.
