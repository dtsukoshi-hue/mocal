


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."should_be_open"("p_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_now_jst   timestamp;
  v_weekday   int;
  v_now_time  time;
  v_row       store_hours%rowtype;
begin
  v_now_jst  := (now() at time zone 'Asia/Tokyo');
  v_weekday  := extract(dow from v_now_jst)::int;
  v_now_time := v_now_jst::time;

  select * into v_row
    from store_hours
    where store_id = p_store_id and weekday = v_weekday;

  if not found then return null; end if;
  if not v_row.is_open then return false; end if;
  if v_row.open_time is null or v_row.close_time is null then return false; end if;

  return v_now_time >= v_row.open_time
     and v_now_time < coalesce(v_row.last_order, v_row.close_time);
end;
$$;


ALTER FUNCTION "public"."should_be_open"("p_store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_store_open_status"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  r record;
  v_should boolean;
begin
  for r in select id, manual_override_until from stores loop
    -- 期限切れ override は null に戻す
    if r.manual_override_until is not null and r.manual_override_until <= now() then
      update stores set manual_override_until = null where id = r.id;
    -- 有効な override 中の店舗はスキップ
    elsif r.manual_override_until is not null and r.manual_override_until > now() then
      continue;
    end if;

    v_should := should_be_open(r.id);
    if v_should is null then continue; end if;
    update stores set is_open = v_should
      where id = r.id and is_open is distinct from v_should;
  end loop;
end;
$$;


ALTER FUNCTION "public"."sync_store_open_status"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."combo_offer_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combo_id" "uuid" NOT NULL,
    "menu_item_id" "uuid" NOT NULL,
    "qty" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "combo_offer_items_qty_check" CHECK (("qty" >= 1))
);


ALTER TABLE "public"."combo_offer_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combo_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price_delta" integer DEFAULT 0 NOT NULL,
    "emoji" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."combo_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "category" "text",
    "emoji" "text",
    "is_available" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "description" "text",
    CONSTRAINT "menu_items_description_check" CHECK (("char_length"("description") <= 200)),
    CONSTRAINT "menu_items_price_check" CHECK (("price" >= 0))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "menu_item_id" "uuid",
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "qty" integer NOT NULL,
    "combo_id" "uuid",
    "combo_label" "text",
    CONSTRAINT "order_items_price_check" CHECK (("price" >= 0)),
    CONSTRAINT "order_items_qty_check" CHECK (("qty" >= 1))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."order_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."order_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" integer DEFAULT "nextval"('"public"."order_number_seq"'::"regclass") NOT NULL,
    "store_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "pickup_type" "text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "total_amount" integer NOT NULL,
    "estimated_ready_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "ready_at" timestamp with time zone,
    "no_show_at" timestamp with time zone,
    "cancelled_reason_type" "text",
    "cancelled_reason_detail" "text",
    "stripe_payment_intent_id" "text",
    "stripe_charge_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_note" "text",
    "stripe_receipt_url" "text",
    "alert_30min_sent" boolean DEFAULT false NOT NULL,
    CONSTRAINT "orders_cancelled_reason_type_check" CHECK (("cancelled_reason_type" = ANY (ARRAY['store_closed'::"text", 'out_of_stock'::"text", 'store_cancel'::"text", 'user_cancel'::"text", 'timeout'::"text", 'payment_failed'::"text", 'amount_mismatch'::"text"]))),
    CONSTRAINT "orders_customer_note_check" CHECK (("char_length"("customer_note") <= 200)),
    CONSTRAINT "orders_pickup_type_check" CHECK (("pickup_type" = ANY (ARRAY['standard'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'accepted'::"text", 'preparing'::"text", 'ready'::"text", 'completed'::"text", 'cancelled'::"text", 'refunded'::"text", 'no_show'::"text"]))),
    CONSTRAINT "orders_total_amount_check" CHECK (("total_amount" >= 0))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processed_webhook_events" (
    "stripe_event_id" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."processed_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "phone" "text",
    "nickname" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid",
    "order_id" "uuid",
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "push_subscriptions_target_check" CHECK (((("store_id" IS NOT NULL) AND ("order_id" IS NULL)) OR (("store_id" IS NULL) AND ("order_id" IS NOT NULL))))
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "weekday" integer NOT NULL,
    "is_open" boolean DEFAULT true NOT NULL,
    "open_time" time without time zone,
    "close_time" time without time zone,
    "last_order" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "store_hours_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."store_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    CONSTRAINT "store_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."store_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "stripe_account_id" "text",
    "is_open" boolean DEFAULT false NOT NULL,
    "wait_minutes" integer DEFAULT 15 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "manual_override_until" timestamp with time zone,
    "area" "text",
    "cuisine_type" "text",
    "logo_url" "text",
    "cover_url" "text",
    "slug" "text",
    "description" "text",
    CONSTRAINT "stores_slug_format" CHECK (("slug" ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'::"text")),
    CONSTRAINT "stores_wait_minutes_check" CHECK (("wait_minutes" = ANY (ARRAY[10, 15, 20, 30, 40, 60])))
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


ALTER TABLE ONLY "public"."combo_offer_items"
    ADD CONSTRAINT "combo_offer_items_combo_id_menu_item_id_key" UNIQUE ("combo_id", "menu_item_id");



ALTER TABLE ONLY "public"."combo_offer_items"
    ADD CONSTRAINT "combo_offer_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combo_offers"
    ADD CONSTRAINT "combo_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_push_subscriptions"
    ADD CONSTRAINT "order_push_subscriptions_order_id_endpoint_key" UNIQUE ("order_id", "endpoint");



ALTER TABLE ONLY "public"."order_push_subscriptions"
    ADD CONSTRAINT "order_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processed_webhook_events"
    ADD CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("stripe_event_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_order_unique" UNIQUE ("endpoint", "order_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_store_unique" UNIQUE ("endpoint", "store_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_hours"
    ADD CONSTRAINT "store_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_hours"
    ADD CONSTRAINT "store_hours_store_id_weekday_key" UNIQUE ("store_id", "weekday");



ALTER TABLE ONLY "public"."store_members"
    ADD CONSTRAINT "store_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_members"
    ADD CONSTRAINT "store_members_store_id_user_id_key" UNIQUE ("store_id", "user_id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_slug_key" UNIQUE ("slug");



CREATE INDEX "idx_combo_offer_items_combo_id" ON "public"."combo_offer_items" USING "btree" ("combo_id");



CREATE INDEX "idx_combo_offers_store_id" ON "public"."combo_offers" USING "btree" ("store_id");



CREATE INDEX "idx_menu_items_store_id" ON "public"."menu_items" USING "btree" ("store_id");



CREATE INDEX "idx_menu_items_store_sort" ON "public"."menu_items" USING "btree" ("store_id", "sort_order", "created_at");



CREATE INDEX "idx_order_items_combo_id" ON "public"."order_items" USING "btree" ("combo_id");



CREATE INDEX "idx_order_push_subs_order" ON "public"."order_push_subscriptions" USING "btree" ("order_id");



CREATE INDEX "idx_orders_alert_flag" ON "public"."orders" USING "btree" ("store_id", "scheduled_at") WHERE (("status" = 'paid'::"text") AND ("pickup_type" = 'scheduled'::"text") AND ("alert_30min_sent" = false));



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_pending_created" ON "public"."orders" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_orders_ready_at" ON "public"."orders" USING "btree" ("ready_at") WHERE ("status" = 'ready'::"text");



CREATE INDEX "idx_orders_scheduled_at" ON "public"."orders" USING "btree" ("scheduled_at") WHERE (("status" = 'paid'::"text") AND ("pickup_type" = 'scheduled'::"text"));



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_store_created" ON "public"."orders" USING "btree" ("store_id", "created_at" DESC);



CREATE INDEX "idx_orders_store_id" ON "public"."orders" USING "btree" ("store_id");



CREATE INDEX "idx_orders_store_status" ON "public"."orders" USING "btree" ("store_id", "status");



CREATE INDEX "idx_orders_stripe_charge" ON "public"."orders" USING "btree" ("stripe_charge_id") WHERE ("stripe_charge_id" IS NOT NULL);



CREATE INDEX "idx_orders_stripe_payment_intent" ON "public"."orders" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "idx_push_subscriptions_order_id" ON "public"."push_subscriptions" USING "btree" ("order_id");



CREATE INDEX "idx_push_subscriptions_store_id" ON "public"."push_subscriptions" USING "btree" ("store_id");



CREATE INDEX "idx_store_hours_store_id" ON "public"."store_hours" USING "btree" ("store_id");



CREATE INDEX "idx_stores_area" ON "public"."stores" USING "btree" ("area");



CREATE INDEX "idx_stores_cuisine_type" ON "public"."stores" USING "btree" ("cuisine_type");



CREATE UNIQUE INDEX "idx_stores_slug" ON "public"."stores" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



ALTER TABLE ONLY "public"."combo_offer_items"
    ADD CONSTRAINT "combo_offer_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "public"."combo_offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combo_offer_items"
    ADD CONSTRAINT "combo_offer_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id");



ALTER TABLE ONLY "public"."combo_offers"
    ADD CONSTRAINT "combo_offers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "public"."combo_offers"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_push_subscriptions"
    ADD CONSTRAINT "order_push_subscriptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_hours"
    ADD CONSTRAINT "store_hours_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_members"
    ADD CONSTRAINT "store_members_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."store_members"
    ADD CONSTRAINT "store_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."combo_offer_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combo_offer_items_public_read" ON "public"."combo_offer_items" FOR SELECT USING (true);



ALTER TABLE "public"."combo_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combo_offers_public_read" ON "public"."combo_offers" FOR SELECT USING (true);



ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_public_read" ON "public"."menu_items" FOR SELECT USING (true);



CREATE POLICY "menu_items_store_member_insert" ON "public"."menu_items" FOR INSERT WITH CHECK (("store_id" IN ( SELECT "store_members"."store_id"
   FROM "public"."store_members"
  WHERE ("store_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "menu_items_store_member_update" ON "public"."menu_items" FOR UPDATE USING (("store_id" IN ( SELECT "store_members"."store_id"
   FROM "public"."store_members"
  WHERE ("store_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_guest_insert" ON "public"."order_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "order_items_guest_select" ON "public"."order_items" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."user_id" IS NULL))));



CREATE POLICY "order_items_store_member_select" ON "public"."order_items" FOR SELECT USING (("order_id" IN ( SELECT "o"."id"
   FROM ("public"."orders" "o"
     JOIN "public"."store_members" "sm" ON (("sm"."store_id" = "o"."store_id")))
  WHERE ("sm"."user_id" = "auth"."uid"()))));



CREATE POLICY "order_items_user_own_select" ON "public"."order_items" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."order_push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_guest_insert" ON "public"."orders" FOR INSERT WITH CHECK ((("user_id" IS NULL) AND ("status" = 'pending'::"text")));



CREATE POLICY "orders_guest_select_by_id" ON "public"."orders" FOR SELECT USING (("user_id" IS NULL));



CREATE POLICY "orders_public_select_by_uuid" ON "public"."orders" FOR SELECT USING (true);



CREATE POLICY "orders_set_payment_intent" ON "public"."orders" FOR UPDATE USING ((("status" = 'pending'::"text") AND ("stripe_payment_intent_id" IS NULL))) WITH CHECK (("status" = 'pending'::"text"));



CREATE POLICY "orders_store_member_select" ON "public"."orders" FOR SELECT USING (("store_id" IN ( SELECT "store_members"."store_id"
   FROM "public"."store_members"
  WHERE ("store_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "orders_store_member_update" ON "public"."orders" FOR UPDATE USING (("store_id" IN ( SELECT "store_members"."store_id"
   FROM "public"."store_members"
  WHERE ("store_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "orders_user_own_select" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "orders_webhook_update" ON "public"."orders" FOR UPDATE USING ((("status" = 'pending'::"text") AND ("stripe_payment_intent_id" IS NOT NULL))) WITH CHECK (("status" = ANY (ARRAY['paid'::"text", 'cancelled'::"text"])));



ALTER TABLE "public"."processed_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_own_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_own_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_own_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."store_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "store_hours_public_read" ON "public"."store_hours" FOR SELECT USING (true);



ALTER TABLE "public"."store_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "store_members_own_read" ON "public"."store_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "store_own_push_subscriptions" ON "public"."push_subscriptions" USING (("store_id" IN ( SELECT "store_members"."store_id"
   FROM "public"."store_members"
  WHERE ("store_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stores_member_update" ON "public"."stores" FOR UPDATE USING (("id" IN ( SELECT "store_members"."store_id"
   FROM "public"."store_members"
  WHERE ("store_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "stores_public_read" ON "public"."stores" FOR SELECT USING (true);



CREATE POLICY "webhook_events_insert" ON "public"."processed_webhook_events" FOR INSERT WITH CHECK (true);



CREATE POLICY "webhook_events_select" ON "public"."processed_webhook_events" FOR SELECT USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."should_be_open"("p_store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."should_be_open"("p_store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."should_be_open"("p_store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_store_open_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_store_open_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_store_open_status"() TO "service_role";
























GRANT ALL ON TABLE "public"."combo_offer_items" TO "anon";
GRANT ALL ON TABLE "public"."combo_offer_items" TO "authenticated";
GRANT ALL ON TABLE "public"."combo_offer_items" TO "service_role";



GRANT ALL ON TABLE "public"."combo_offers" TO "anon";
GRANT ALL ON TABLE "public"."combo_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."combo_offers" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."order_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."order_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."processed_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."store_hours" TO "anon";
GRANT ALL ON TABLE "public"."store_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."store_hours" TO "service_role";



GRANT ALL ON TABLE "public"."store_members" TO "anon";
GRANT ALL ON TABLE "public"."store_members" TO "authenticated";
GRANT ALL ON TABLE "public"."store_members" TO "service_role";



GRANT ALL ON TABLE "public"."stores" TO "anon";
GRANT ALL ON TABLE "public"."stores" TO "authenticated";
GRANT ALL ON TABLE "public"."stores" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


