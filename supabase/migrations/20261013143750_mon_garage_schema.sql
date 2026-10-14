/*
# Mon Garage — Schéma de base de données

1. Tables créées
- `vehicles` : véhicules de l'utilisateur (marque, modèle, année, immatriculation, motorisation, kilométrage)
- `maintenance_records` : historique des entretiens (date, kilométrage, type, description, pièces, coût, remarques)
- `reminders` : échéances d'entretien (type, kilométrage cible, date cible, seuils d'alerte, statut)
- `push_subscriptions` : abonnements push par appareil/navigateur (endpoint, clés p256dh/auth, user_agent)
- `notification_log` : journal des notifications envoyées (anti-doublons, statut de livraison)

2. Sécurité
- RLS activée sur toutes les tables
- Chaque table a 4 politiques (SELECT, INSERT, UPDATE, DELETE) scoped à l'utilisateur authentifié
- `user_id` par défaut à `auth.uid()` sur toutes les tables

3. Notes importantes
- L'application utilise un compte personnel authentifié (Supabase Auth email/password)
- Les données sont accessibles depuis plusieurs appareils via le même compte
- Les colonnes owner sont DEFAULT auth.uid() pour que les inserts frontend fonctionnent sans passer user_id
*/

-- Table: vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  registration text,
  engine text,
  mileage integer NOT NULL DEFAULT 0,
  mileage_updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_vehicles" ON vehicles;
CREATE POLICY "select_own_vehicles" ON vehicles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_vehicles" ON vehicles;
CREATE POLICY "insert_own_vehicles" ON vehicles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_vehicles" ON vehicles;
CREATE POLICY "update_own_vehicles" ON vehicles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_vehicles" ON vehicles;
CREATE POLICY "delete_own_vehicles" ON vehicles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Table: maintenance_records
CREATE TABLE IF NOT EXISTS maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  mileage integer,
  type text NOT NULL,
  description text,
  parts_replaced text,
  cost numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_maintenance" ON maintenance_records;
CREATE POLICY "select_own_maintenance" ON maintenance_records FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_maintenance" ON maintenance_records;
CREATE POLICY "insert_own_maintenance" ON maintenance_records FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_maintenance" ON maintenance_records;
CREATE POLICY "update_own_maintenance" ON maintenance_records FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_maintenance" ON maintenance_records;
CREATE POLICY "delete_own_maintenance" ON maintenance_records FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Table: reminders
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type text NOT NULL,
  target_mileage integer,
  target_date date,
  alert_km_threshold integer DEFAULT 1000,
  alert_days_threshold integer DEFAULT 30,
  active boolean DEFAULT true,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  next_interval_km integer,
  next_interval_days integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_reminders" ON reminders;
CREATE POLICY "select_own_reminders" ON reminders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reminders" ON reminders;
CREATE POLICY "insert_own_reminders" ON reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reminders" ON reminders;
CREATE POLICY "update_own_reminders" ON reminders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reminders" ON reminders;
CREATE POLICY "delete_own_reminders" ON reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Table: push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_push_subs" ON push_subscriptions;
CREATE POLICY "select_own_push_subs" ON push_subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_push_subs" ON push_subscriptions;
CREATE POLICY "insert_own_push_subs" ON push_subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_push_subs" ON push_subscriptions;
CREATE POLICY "update_own_push_subs" ON push_subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_push_subs" ON push_subscriptions;
CREATE POLICY "delete_own_push_subs" ON push_subscriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Table: notification_log
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_id uuid REFERENCES reminders(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz DEFAULT now(),
  error_message text
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notif_log" ON notification_log;
CREATE POLICY "select_own_notif_log" ON notification_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notif_log" ON notification_log;
CREATE POLICY "insert_own_notif_log" ON notification_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notif_log" ON notification_log;
CREATE POLICY "update_own_notif_log" ON notification_log FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notif_log" ON notification_log;
CREATE POLICY "delete_own_notif_log" ON notification_log FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_user_id ON maintenance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle_id ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_vehicle_id ON reminders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_notif_log_user_id ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_reminder_id ON notification_log(reminder_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_sent_at ON notification_log(sent_at);
