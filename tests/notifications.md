# Tests des notifications push — Mon Garage

Ce document décrit les tests à effectuer pour vérifier le fonctionnement des notifications push sur iPhone et Android, y compris lorsque l'application est fermée.

## Pré-requis

Avant d'exécuter ces tests, vous devez avoir configuré :

1. Les clés VAPID (`VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`) comme secrets des Edge Functions Supabase.
2. `VAPID_SUBJECT` (par exemple `mailto:votre@email.com`) comme secret d'Edge Function.
3. `CRON_SECRET` comme secret d'Edge Function (valeur aléatoire de votre choix).
4. `VITE_VAPID_PUBLIC_KEY` dans le fichier `.env` local.
5. L'application installée sur l'écran d'accueil (PWA).
6. Un compte créé et au moins un véhicule enregistré.

## Test 1 : Abonnement aux notifications (Android)

**Plateforme** : Android (Chrome)

1. Ouvrez l'app installée sur l'écran d'accueil.
2. Allez dans Paramètres > Notifications push.
3. Touchez « Activer les notifications ».
4. Autorisez les notifications quand le navigateur le demande.
5. **Résultat attendu** : le message « Notifications activées sur cet appareil » s'affiche. L'appareil apparaît dans la liste « Appareils enregistrés ».

## Test 2 : Abonnement aux notifications (iPhone)

**Plateforme** : iPhone iOS 16.4+ (Safari > Ajouter à l'écran d'accueil)

1. Ouvrez l'app installée (pas dans Safari — l'icône de l'écran d'accueil).
2. Allez dans Paramètres > Notifications push.
3. Touchez « Activer les notifications ».
4. Autorisez les notifications.
5. **Résultat attendu** : identique au Test 1. Si le bouton n'apparaît pas ou que le message « non supporté » s'affiche, vérifiez que l'app est bien lancée depuis l'écran d'accueil et que iOS est >= 16.4.

## Test 3 : Notification de test (app ouverte)

**Plateforme** : Android et iPhone

1. Dans Paramètres > Notifications push, touchez « Envoyer une notification de test ».
2. **Résultat attendu** : une notification push apparaît avec le titre « Mon Garage — Test » et le corps « Notification de test envoyée avec succès ». Le message de confirmation s'affiche dans l'app avec le nombre d'appareils touchés.

## Test 4 : Notification de test (app fermée)

**Plateforme** : Android et iPhone

1. Activez les notifications (Tests 1-2).
2. Fermez complètement l'app (swipe-up dans le sélecteur d'applications).
3. Depuis un autre appareil ou un terminal, appelez l'Edge Function `send-notification` avec le jeton d'authentification :
   ```bash
   curl -X POST https://VOTRE_PROJET.supabase.co/functions/v1/send-notification \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer VOTRE_JETON_ANON" \
     -d '{}'
   ```
4. **Résultat attendu** : la notification push apparaît sur l'écran de verrouillage ou dans le centre de notifications, même avec l'app fermée.

## Test 5 : Notification de rappel automatique (cron)

**Plateforme** : Android et iPhone

1. Créez un véhicule avec un kilométrage actuel.
2. Créez un rappel avec une date cible = aujourd'hui et un seuil d'alerte de 30 jours.
3. Déclenchez manuellement le cron via GitHub Actions (onglet Actions > « Check reminders (cron) » > Run workflow) ou via :
   ```bash
   curl -X POST https://VOTRE_PROJET.supabase.co/functions/v1/check-reminders \
     -H "Content-Type: application/json" \
     -H "X-Cron-Secret: VOTRE_CRON_SECRET" \
     -d '{"secret":"VOTRE_CRON_SECRET"}'
   ```
4. **Résultat attendu** : une notification push s'affiche avec le véhicule et le type d'entretien. Une entrée est créée dans `notification_log` avec le statut `sent`.

## Test 6 : Prévention des doublons

1. Après le Test 5, déclenchez à nouveau le cron immédiatement.
2. **Résultat attendu** : aucune nouvelle notification n'est envoyée. Le log indique `skipped: 1`. La vérification ne considère que les notifications avec statut `sent` dans la fenêtre de temps (24h pour « à effectuer », 7 jours pour « en retard »).

## Test 7 : Notification en retard persistante

1. Créez un rappel avec une date cible dans le passé (hier).
2. Déclenchez le cron.
3. **Résultat attendu** : une notification « en retard » est envoyée.
4. Déclenchez le cron le lendemain.
5. **Résultat attendu** : aucune nouvelle notification (la précédente est dans les 7 jours). Une nouvelle notification ne sera envoyée qu'après 7 jours.

## Test 8 : Nettoyage des abonnements expirés

1. Notez le nombre d'appareils enregistrés dans Paramètres.
2. Désactivez les notifications depuis le navigateur (Réglages du site > Notifications > Bloquer).
3. Envoyez une notification de test.
4. **Résultat attendu** : l'appareil dont l'abonnement a expiré (statut 404/410) est automatiquement supprimé de la liste.

## Test 9 : Fuseau horaire Europe/Zurich

1. Créez un rappel avec une date cible = aujourd'hui.
2. Vérifiez que le statut affiché est « À effectuer » (et non « En retard ») si la date du jour en Europe/Zurich correspond à la date cible.
3. Le résultat de l'Edge Function `check-reminders` inclut `zurichDate` dans la réponse pour vérification.

## Test 10 : Changement d'heure (passage été/hiver)

1. Ce test ne peut être effectué qu'au moment du changement d'heure (dernier dimanche d'octobre / dernier dimanche de mars).
2. Vérifiez que les rappels dont la date cible est le jour du changement d'heure sont correctement évalués.
3. Le cron GitHub Actions s'exécute à 07:00 UTC, ce qui correspond à 08:00 ou 09:00 Europe/Zurich selon la saison.

## Test 11 : Sécurité — refus sans CRON_SECRET

1. Appelez `check-reminders` sans le header `X-Cron-Secret` :
   ```bash
   curl -X POST https://VOTRE_PROJET.supabase.co/functions/v1/check-reminders \
     -H "Content-Type: application/json" -d '{}'
   ```
2. **Résultat attendu** : HTTP 403 « Non autorisé ».

## Test 12 : Sécurité — refus sans authentification

1. Appelez `send-notification` sans jeton :
   ```bash
   curl -X POST https://VOTRE_PROJET.supabase.co/functions/v1/send-notification \
     -H "Content-Type: application/json" -d '{}'
   ```
2. **Résultat attendu** : HTTP 401 « Jeton d'authentification manquant » ou « Non authentifié ».

## Test 13 : Envoi arbitraire bloqué

1. Appelez `send-notification` avec un corps de message personnalisé :
   ```bash
   curl -X POST https://VOTRE_PROJET.supabase.co/functions/v1/send-notification \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer VOTRE_JETON" \
     -d '{"title":"Spam","body":"Message arbitraire"}'
   ```
2. **Résultat attendu** : la notification reçue contient toujours « Mon Garage — Test » et « Notification de test envoyée avec succès ». Le titre et le corps envoyés par le client sont ignorés.

## Résultats

| Test | Plateforme | Date | Résultat |
|------|-----------|------|----------|
| 1 — Abonnement Android | Android | | |
| 2 — Abonnement iPhone | iPhone | | |
| 3 — Test app ouverte | Android | | |
| 3 — Test app ouverte | iPhone | | |
| 4 — Test app fermée | Android | | |
| 4 — Test app fermée | iPhone | | |
| 5 — Rappel automatique | Android | | |
| 5 — Rappel automatique | iPhone | | |
| 6 — Prévention doublons | — | | |
| 7 — Retard persistant | — | | |
| 8 — Abonnement expiré | — | | |
| 9 — Fuseau Zurich | — | | |
| 10 — Changement d'heure | — | | |
| 11 — Refus sans CRON_SECRET | — | | |
| 12 — Refus sans auth | — | | |
| 13 — Envoi arbitraire bloqué | — | | |
