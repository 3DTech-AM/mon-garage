# Mon Garage

Application personnelle de gestion de l'entretien mécanique de vos véhicules.

PWA installable sur iPhone (iOS 16.4+) et Android, avec notifications push, synchronisation multi-appareils, et hébergement gratuit sur GitHub Pages.

## Fonctionnalités

- **Gestion des véhicules** : ajout, modification, suppression, suivi du kilométrage avec protection contre les valeurs inférieures.
- **Historique des entretiens** : enregistrement des interventions avec catégories prédéfinies ou personnalisées, pièces, coûts, remarques.
- **Échéances et rappels** : création d'échéances par date, par kilométrage, ou les deux. Alertes paramétrables. Clôture avec création automatique de la prochaine échéance.
- **Notifications push** : vraies notifications Web Push (VAPID) reçues même quand l'app est fermée. Vérification quotidienne automatique via Supabase Cron.
- **PWA** : installable sur l'écran d'accueil, fonctionne hors ligne en consultation.
- **Sauvegarde** : export JSON et CSV, import JSON avec gestion des doublons.
- **Sécurité** : authentification Supabase, Row Level Security sur toutes les tables.

## Technologies

- React + TypeScript + Vite
- Tailwind CSS
- Supabase (Auth, PostgreSQL, Edge Functions, Cron)
- Web Push API + VAPID
- Service Worker + Web App Manifest (PWA)

## Pré-requis

- Node.js 20+
- Un compte Supabase (le projet est déjà provisionné)
- Les clés VAPID pour les notifications push (voir ci-dessous)

## Installation locale

```bash
npm install
npm run dev
```

L'application s'ouvre sur `http://localhost:5173`.

## Configuration

### 1. Variables d'environnement

Le fichier `.env` contient :

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase (déjà configurée) |
| `VITE_SUPABASE_ANON_KEY` | Clé anon Supabase (déjà configurée) |
| `VITE_VAPID_PUBLIC_KEY` | Clé publique VAPID pour les notifications push |

### 2. Génération des clés VAPID

Les notifications push nécessitent une paire de clés VAPID. Générez-les avec :

```bash
npx web-push generate-vapid-keys
```

Vous obtenez une **public key** et une **private key**.

- Ajoutez la **public key** dans le fichier `.env` :
  ```
  VITE_VAPID_PUBLIC_KEY=votre_cle_publique
  ```

- Ajoutez les trois secrets suivants comme **secrets des Edge Functions** dans le dashboard Supabase (Edge Functions > Secrets) :
  - `VAPID_PUBLIC_KEY` = votre clé publique
  - `VAPID_PRIVATE_KEY` = votre clé privée
  - `VAPID_SUBJECT` = votre adresse de contact (par exemple `mailto:votre@email.com`)

  **La clé privée ne doit JAMAIS apparaître dans le code frontend.**

- Ajoutez également le secret `CRON_SECRET` : choisissez une chaîne aléatoire (par exemple 32 caractères). Ce secret protège l'Edge Function `check-reminders` contre les appels non autorisés.

### 3. Base de données

Le schéma SQL a déjà été appliqué au projet Supabase. Il crée 5 tables :

- `vehicles` — véhicules
- `maintenance_records` — historique des entretiens
- `reminders` — échéances et rappels
- `push_subscriptions` — abonnements push par appareil
- `notification_log` — journal des notifications envoyées

Toutes les tables ont RLS activé avec des politiques d'ownership (`auth.uid() = user_id`).

### 4. Configuration du Cron quotidien

La vérification quotidienne des échéances est déclenchée par **GitHub Actions** (fichier `.github/workflows/check-reminders.yml`). Le workflow s'exécute chaque jour à 07:00 UTC (08:00 ou 09:00 Europe/Zurich selon la saison) et appelle l'Edge Function `check-reminders` avec le secret `CRON_SECRET`.

Vous pouvez aussi déclencher la vérification manuellement depuis l'onglet **Actions** de votre dépôt GitHub.

Alternativement, vous pouvez utiliser Supabase Cron à la place de GitHub Actions. Dans le dashboard Supabase : **Database > Extensions**, activez `pg_cron` si nécessaire. Puis dans **SQL Editor** :

```sql
SELECT cron.schedule(
  'mon-garage-check-reminders',
  '0 7 * * *',
  $
  SELECT net.http_post(
    url := 'https://VOTRE_PROJET.supabase.co/functions/v1/check-reminders',
    headers := '{"Content-Type": "application/json", "X-Cron-Secret": "VOTRE_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $
);
```

Remplacez `VOTRE_PROJET` et `VOTRE_CRON_SECRET` par vos valeurs.

### 5. Edge Functions

Les deux Edge Functions sont déjà déployées :

- **`send-notification`** — Envoie une notification push à tous les appareils enregistrés. Appelée par l'app pour les tests.
- **`check-reminders`** — Vérifie toutes les échéances actives et envoie des notifications pour celles qui arrivent à échéance ou en retard. Appelée par le Cron quotidien.

## Déploiement sur GitHub Pages

### 1. Préparer le dépôt

1. Créez un dépôt sur GitHub.
2. Poussez le code dans la branche `main`.

### 2. Configurer les secrets GitHub

Dans **Settings > Secrets and variables > Actions** de votre dépôt, ajoutez :

- `VITE_SUPABASE_URL` — l'URL Supabase
- `VITE_SUPABASE_ANON_KEY` — la clé anon Supabase
- `VITE_VAPID_PUBLIC_KEY` — la clé publique VAPID
- `CRON_SECRET` — le secret utilisé pour authentifier le cron `check-reminders`

Si votre site est hébergé sur `https://nomutilisateur.github.io/nom-depot/` (projet), ajoutez aussi une variable (pas un secret) :

- Dans **Settings > Secrets and variables > Actions > Variables** : `VITE_BASE_PATH` = `/nom-depot/`

Si vous utilisez un domaine personnalisé ou une page utilisateur (`https://nomutilisateur.github.io/`), laissez `VITE_BASE_PATH` vide (par défaut `/`).

### 3. Activer GitHub Pages

Dans **Settings > Pages** :
- Source : **GitHub Actions**

### 4. Déployer

Le workflow `.github/workflows/deploy.yml` se déclenche automatiquement à chaque push sur `main`. Il compile le projet et déploie le résultat sur GitHub Pages.

### 5. Service Worker et GitHub Pages

Le service worker (`public/sw.js`) et le manifeste (`public/manifest.json`) utilisent des chemins relatifs au `base` configuré dans Vite. Le service worker s'enregistre avec le scope correct automatiquement.

## Installation sur iPhone (iOS 16.4+)

1. Ouvrez l'app dans Safari.
2. Touchez le bouton Partager.
3. Sélectionnez « Sur l'écran d'accueil ».
4. Confirmez. L'app s'installe comme une PWA.
5. Ouvrez l'app installée (pas Safari) et activez les notifications dans les Paramètres.

**Important** : Sur iOS, les notifications push ne fonctionnent qu'avec les PWA installées sur l'écran d'accueil, pas dans Safari.

## Installation sur Android

1. Ouvrez l'app dans Chrome.
2. Touchez le menu (trois points).
3. Sélectionnez « Ajouter à l'écran d'accueil ».
4. Ouvrez l'app installée et activez les notifications.

## Fonctionnement hors ligne

- L'app met en cache les fichiers nécessaires via le service worker.
- Les données déjà chargées restent consultables hors ligne.
- Les opérations d'écriture sont désactivées hors ligne (bannière d'avertissement affichée).
- Aucune modification n'est perdue silencieusement.

## Tests des notifications push

Les tests à effectuer sont décrits dans `tests/notifications.md`. Ils couvrent :

- Abonnement sur iPhone et Android
- Notification de test (app ouverte et fermée)
- Rappel automatique via cron
- Prévention des doublons
- Notifications en retard persistantes
- Nettoyage des abonnements expirés
- Fuseau horaire Europe/Zurich
- Changement d'heure
- Sécurité (refus sans CRON_SECRET, sans authentification, envoi arbitraire bloqué)

**Aucun test réel n'a encore été effectué.** Les notifications ne doivent pas être considérées comme fonctionnelles tant que les tests décrits n'ont pas été validés sur des appareils physiques.

## Limitations

- La réception des notifications n'est pas garantie si le service backend Supabase est suspendu (projet gratuit en pause).
- Les notifications kilométriques dépendent de l'actualisation manuelle du compteur dans l'app.
- Une notification acceptée par le serveur push n'est pas une preuve de réception sur le téléphone.
- Supabase Free peut suspendre les projets inactifs après une période d'inactivité.

## Structure du projet

```
src/
├── components/      # Composants UI réutilisables
├── context/         # Contextes React (Auth, Modal)
├── hooks/           # Hooks personnalisés
├── lib/             # Logique métier (supabase, push, reminders, export)
├── screens/         # Écrans de l'app (Auth, Home, Vehicles, Maintenance, Reminders, Settings)
├── types/           # Types TypeScript
└── App.tsx          # Composant principal avec navigation
public/
├── icons/           # Icônes PWA
├── manifest.json    # Manifeste PWA
└── sw.js            # Service Worker
supabase/
├── config.toml      # Configuration Supabase
├── functions/       # Edge Functions
│   ├── send-notification/
│   └── check-reminders/
└── migrations/      # Schéma SQL
.github/
└── workflows/       # GitHub Actions (déploiement + cron quotidien)
tests/
└── notifications.md # Tests des notifications push
```

## Scripts

- `npm run dev` — Démarrage en mode développement
- `npm run build` — Compilation pour la production
- `npm run preview` — Prévisualisation du build
- `npm run typecheck` — Vérification des types TypeScript
- `npm run lint` — Analyse du code avec ESLint
