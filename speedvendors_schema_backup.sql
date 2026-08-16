


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."order_status_enum" AS ENUM (
    'draft',
    'awaiting_payment',
    'paid',
    'cancelled'
);


ALTER TYPE "public"."order_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_update_stock"("updates" "jsonb") RETURNS TABLE("product_id" "uuid", "old_stock" integer, "new_stock" integer, "success" boolean, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  update_record jsonb;
  current_stock integer;
  new_stock_value integer;
  product_uuid uuid;
BEGIN
  -- Loop through each update in the JSON array
  FOR update_record IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    BEGIN
      -- Extract values from JSON
      product_uuid := (update_record->>'product_id')::uuid;
      new_stock_value := (update_record->>'stock')::integer;
      
      -- Get current stock
      SELECT stock INTO current_stock 
      FROM public.products 
      WHERE id = product_uuid;
      
      IF current_stock IS NULL THEN
        -- Product not found
        RETURN QUERY SELECT 
          product_uuid,
          NULL::integer,
          NULL::integer,
          false,
          'Product not found'::text;
        CONTINUE;
      END IF;
      
      -- Update the stock
      UPDATE public.products 
      SET 
        stock = new_stock_value,
        updated_at = now()
      WHERE id = product_uuid;
      
      -- Return success result
      RETURN QUERY SELECT 
        product_uuid,
        current_stock,
        new_stock_value,
        true,
        NULL::text;
        
    EXCEPTION WHEN OTHERS THEN
      -- Return error result
      RETURN QUERY SELECT 
        product_uuid,
        current_stock,
        NULL::integer,
        false,
        SQLERRM::text;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_update_stock"("updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_abandoned_carts"("p_keep_days" integer DEFAULT 60) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.abandoned_carts
  WHERE status IN ('converted', 'discarded', 'expired')
    AND COALESCE(converted_at, updated_at, created_at) < now() - make_interval(days => p_keep_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_abandoned_carts"("p_keep_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_checkout_sessions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE affected integer; BEGIN DELETE FROM public.checkout_sessions WHERE status IN ('expired', 'cancelled') AND updated_at < now() - interval '30 days'; GET DIAGNOSTICS affected = ROW_COUNT; RETURN affected; END; $$;


ALTER FUNCTION "public"."cleanup_old_checkout_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_checkout_session_to_order"("p_session_id" "uuid", "p_netopia_payment_id" "text" DEFAULT NULL::"text", "p_provider_response" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s public.checkout_sessions%ROWTYPE;
  new_order_id uuid;
  existing_tx_id uuid;
  item jsonb;
  v_payment_id text;
BEGIN
  PERFORM public.expire_checkout_sessions();
  SELECT * INTO s FROM public.checkout_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND'); END IF;
  IF s.order_id IS NOT NULL OR s.status = 'converted' THEN
    RETURN jsonb_build_object('success', true, 'already_converted', true, 'order_id', s.order_id, 'checkout_session_id', s.id);
  END IF;
  IF s.status = 'expired' OR s.expires_at < now() THEN
    UPDATE public.checkout_sessions SET status = 'expired', updated_at = now() WHERE id = s.id AND status = 'pending';
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_EXPIRED');
  END IF;
  IF s.status = 'cancelled' THEN RETURN jsonb_build_object('success', false, 'error', 'SESSION_CANCELLED'); END IF;
  v_payment_id := COALESCE(p_netopia_payment_id, s.netopia_payment_id);
  INSERT INTO public.orders (user_id, customer_name, customer_email, customer_phone, customer_address, customer_city, customer_county, customer_street, customer_street_number, customer_block, customer_apartment, delivery_type, selected_carrier_code, locker_id, locker_name, locker_address, total, payment_status, order_status, shipping_status, checkout_session_id)
  VALUES (s.user_id, s.customer_name, s.customer_email, s.customer_phone, s.customer_address, s.customer_city, s.customer_county, s.customer_street, s.customer_street_number, s.customer_block, s.customer_apartment, s.delivery_type, s.selected_carrier_code, s.locker_id, s.locker_name, s.locker_address, s.total, 'pending', 'awaiting_payment', 'pending', s.id)
  RETURNING id INTO new_order_id;
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) LOOP
    INSERT INTO public.order_items (order_id, product_id, product_title, product_price, quantity)
    VALUES (new_order_id, NULLIF(item->>'product_id', '')::uuid, COALESCE(item->>'title', item->>'product_title', 'Item'), COALESCE((item->>'price')::numeric, (item->>'product_price')::numeric, 0), COALESCE((item->>'quantity')::integer, 1));
  END LOOP;
  UPDATE public.orders SET payment_status = 'paid', order_status = 'paid', updated_at = now() WHERE id = new_order_id;
  SELECT id INTO existing_tx_id FROM public.payment_transactions WHERE checkout_session_id = s.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF existing_tx_id IS NOT NULL THEN
    UPDATE public.payment_transactions SET order_id = new_order_id, payment_status = 'completed', netopia_payment_id = COALESCE(v_payment_id, netopia_payment_id), netopia_order_id = COALESCE(netopia_order_id, s.id::text), provider_response = COALESCE(p_provider_response, provider_response), updated_at = now() WHERE id = existing_tx_id;
  ELSE
    INSERT INTO public.payment_transactions (user_id, order_id, checkout_session_id, payment_provider, payment_status, amount, currency, payment_method, netopia_payment_id, netopia_order_id, provider_response)
    VALUES (s.user_id, new_order_id, s.id, 'netopia', 'completed', s.total, 'RON', 'card', v_payment_id, s.id::text, p_provider_response);
  END IF;
  UPDATE public.checkout_sessions SET status = 'converted', payment_status = 'paid', order_id = new_order_id, netopia_payment_id = COALESCE(v_payment_id, netopia_payment_id), provider_response = COALESCE(p_provider_response, provider_response), updated_at = now() WHERE id = s.id;
  RETURN jsonb_build_object('success', true, 'already_converted', false, 'order_id', new_order_id, 'checkout_session_id', s.id, 'user_id', s.user_id, 'customer_name', s.customer_name, 'total', s.total);
EXCEPTION WHEN unique_violation THEN
  SELECT order_id INTO new_order_id FROM public.checkout_sessions WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'already_converted', true, 'order_id', new_order_id, 'checkout_session_id', p_session_id);
END; $$;


ALTER FUNCTION "public"."convert_checkout_session_to_order"("p_session_id" "uuid", "p_netopia_payment_id" "text", "p_provider_response" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_abandoned_carts"("p_idle_days" integer DEFAULT 14) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.abandoned_carts
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND last_activity_at < now() - make_interval(days => p_idle_days);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."expire_abandoned_carts"("p_idle_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_checkout_sessions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE affected integer; BEGIN UPDATE public.checkout_sessions SET status = 'expired', updated_at = now() WHERE status = 'pending' AND expires_at < now(); GET DIAGNOSTICS affected = ROW_COUNT; RETURN affected; END; $$;


ALTER FUNCTION "public"."expire_checkout_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, store_name)
  VALUES (NEW.id, 'My Store');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reduce_stock_on_order_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Only reduce stock when order transitions to 'paid' status
  IF NEW.order_status = 'paid' AND (OLD.order_status IS NULL OR OLD.order_status != 'paid') THEN
    -- Reduce stock for all items in this order
    UPDATE public.products p
    SET 
      stock = p.stock - oi.quantity,
      updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
    
    -- Check if any product went below zero and log warning
    IF EXISTS (
      SELECT 1 FROM public.products p
      INNER JOIN public.order_items oi ON oi.product_id = p.id
      WHERE oi.order_id = NEW.id AND p.stock < 0
    ) THEN
      RAISE NOTICE 'Warning: Some products have negative stock after order %', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reduce_stock_on_order_paid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_product_stock_on_order_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Restore stock by adding back the quantity that was ordered
  UPDATE public.products 
  SET 
    stock = stock + OLD.quantity,
    updated_at = now()
  WHERE id = OLD.product_id;
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."restore_product_stock_on_order_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_stock_on_order_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Restore stock when order transitions to 'cancelled' status
  IF NEW.order_status = 'cancelled' AND OLD.order_status != 'cancelled' THEN
    -- Restore stock for all items in this order (only if it was previously paid)
    IF OLD.order_status = 'paid' THEN
      UPDATE public.products p
      SET 
        stock = p.stock + oi.quantity,
        updated_at = now()
      FROM public.order_items oi
      WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restore_stock_on_order_cancel"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."sync_review_is_approved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.is_approved := (NEW.status = 'approved');
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    IF NEW.merchant_reply IS DISTINCT FROM OLD.merchant_reply THEN
      IF NEW.merchant_reply IS NULL OR btrim(NEW.merchant_reply) = '' THEN
        NEW.merchant_reply := NULL;
        NEW.merchant_replied_at := NULL;
      ELSE
        NEW.merchant_replied_at := COALESCE(NEW.merchant_replied_at, now());
      END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.merchant_reply IS NOT NULL AND btrim(NEW.merchant_reply) <> '' THEN
      NEW.merchant_replied_at := COALESCE(NEW.merchant_replied_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_review_is_approved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_product_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Handle INSERT (reduce stock)
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products 
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
    
    -- Check if stock goes negative
    IF (SELECT stock FROM public.products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %', 
        (SELECT stock + NEW.quantity FROM public.products WHERE id = NEW.product_id), 
        NEW.quantity;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE (restore stock)
  IF TG_OP = 'DELETE' THEN
    UPDATE public.products 
    SET stock = stock + OLD.quantity
    WHERE id = OLD.product_id;
    
    RETURN OLD;
  END IF;
  
  -- Handle UPDATE (adjust stock difference)
  IF TG_OP = 'UPDATE' THEN
    -- Only update if quantity changed
    IF OLD.quantity != NEW.quantity THEN
      UPDATE public.products 
      SET stock = stock + OLD.quantity - NEW.quantity
      WHERE id = NEW.product_id;
      
      -- Check if stock goes negative
      IF (SELECT stock FROM public.products WHERE id = NEW.product_id) < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %', 
          (SELECT stock + NEW.quantity - OLD.quantity FROM public.products WHERE id = NEW.product_id), 
          NEW.quantity;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_product_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_product_stock_on_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Update stock by reducing the quantity ordered
  UPDATE public.products 
  SET 
    stock = stock - NEW.quantity,
    updated_at = now()
  WHERE id = NEW.product_id;
  
  -- Check if stock went below zero and log a warning
  IF (SELECT stock FROM public.products WHERE id = NEW.product_id) < 0 THEN
    RAISE NOTICE 'Warning: Product % stock is now negative: %', 
      NEW.product_title, 
      (SELECT stock FROM public.products WHERE id = NEW.product_id);
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_product_stock_on_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."abandoned_carts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_token" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "customer_name" "text",
    "customer_email" "text",
    "customer_phone" "text",
    "customer_address" "text",
    "customer_city" "text",
    "customer_county" "text",
    "customer_street" "text",
    "customer_street_number" "text",
    "customer_block" "text",
    "customer_apartment" "text",
    "delivery_type" "text",
    "selected_carrier_code" "text",
    "locker_id" "text",
    "locker_name" "text",
    "locker_address" "text",
    "payment_method" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cart_subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "checkout_step" "text" DEFAULT 'cart'::"text" NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recovered_at" timestamp with time zone,
    "converted_at" timestamp with time zone,
    "converted_order_id" "uuid",
    "converted_checkout_session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "abandoned_carts_checkout_step_check" CHECK (("checkout_step" = ANY (ARRAY['cart'::"text", 'checkout'::"text", 'ready'::"text"]))),
    CONSTRAINT "abandoned_carts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'converted'::"text", 'discarded'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."abandoned_carts" OWNER TO "postgres";


COMMENT ON TABLE "public"."abandoned_carts" IS 'Pre–Place Order checkout progress. Independent of checkout_sessions (pending card) and orders.';



CREATE TABLE IF NOT EXISTS "public"."carrier_services" (
    "id" integer NOT NULL,
    "carrier_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "service_code" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."carrier_services" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."carrier_services_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."carrier_services_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."carrier_services_id_seq" OWNED BY "public"."carrier_services"."id";



CREATE TABLE IF NOT EXISTS "public"."carriers" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "api_base_url" "text" NOT NULL,
    "logo_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."carriers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."carriers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."carriers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."carriers_id_seq" OWNED BY "public"."carriers"."id";



CREATE TABLE IF NOT EXISTS "public"."checkout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_method" "text" DEFAULT 'card'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text" NOT NULL,
    "customer_phone" "text",
    "customer_address" "text" NOT NULL,
    "customer_city" "text",
    "customer_county" "text",
    "customer_street" "text",
    "customer_street_number" "text",
    "customer_block" "text",
    "customer_apartment" "text",
    "delivery_type" "text",
    "selected_carrier_code" "text",
    "locker_id" "text",
    "locker_name" "text",
    "locker_address" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cart_fingerprint" "text" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "shipping_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "discount_code" "text",
    "discount_meta" "jsonb",
    "netopia_payment_id" "text",
    "netopia_payment_url" "text",
    "provider_response" "jsonb",
    "order_id" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "checkout_sessions_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "checkout_sessions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text", 'expired'::"text", 'converted'::"text"])))
);


ALTER TABLE "public"."checkout_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" NOT NULL,
    "discount_value" numeric NOT NULL,
    "start_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_date" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discounts_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed_amount'::"text"]))),
    CONSTRAINT "discounts_discount_value_check" CHECK (("discount_value" > (0)::numeric))
);


ALTER TABLE "public"."discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_title" "text" NOT NULL,
    "product_price" numeric(10,2) NOT NULL,
    "quantity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text" NOT NULL,
    "customer_phone" "text",
    "customer_address" "text" NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "shipping_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invoice_number" "text",
    "invoice_series" "text",
    "invoice_link" "text",
    "awb_number" "text",
    "carrier_name" "text",
    "tracking_url" "text",
    "estimated_delivery_date" "date",
    "eawb_order_id" integer,
    "customer_city" "text",
    "customer_county" "text",
    "customer_street" "text",
    "customer_street_number" "text",
    "customer_block" "text",
    "customer_apartment" "text",
    "delivery_type" "text" DEFAULT 'home'::"text",
    "selected_carrier_code" "text",
    "locker_id" "text",
    "locker_name" "text",
    "locker_address" "text",
    "order_status" "public"."order_status_enum" DEFAULT 'awaiting_payment'::"public"."order_status_enum",
    "checkout_session_id" "uuid",
    "awb_label_url" "text",
    "awb_service_name" "text",
    "awb_service_id" integer,
    "awb_carrier_id" integer,
    "awb_shipping_cost" numeric,
    "awb_cod_amount" numeric,
    "locker_deposit_code" "text",
    "awb_response_extra" "jsonb",
    CONSTRAINT "orders_delivery_type_check" CHECK (("delivery_type" = ANY (ARRAY['home'::"text", 'locker'::"text"]))),
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'cash'::"text", 'invoiced'::"text"]))),
    CONSTRAINT "orders_shipping_status_check" CHECK (("shipping_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'shipped'::"text", 'delivered'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."delivery_type" IS 'Type of delivery: home (standard address) or locker (pickup point)';



COMMENT ON COLUMN "public"."orders"."selected_carrier_code" IS 'Carrier code selected by customer for locker delivery';



COMMENT ON COLUMN "public"."orders"."locker_id" IS 'Unique identifier of the selected locker';



COMMENT ON COLUMN "public"."orders"."locker_name" IS 'Display name of the selected locker';



COMMENT ON COLUMN "public"."orders"."locker_address" IS 'Full address of the selected locker';



COMMENT ON COLUMN "public"."orders"."awb_cod_amount" IS 'Cash-on-delivery amount sent to eAWB as bank_repayment_amount';



COMMENT ON COLUMN "public"."orders"."locker_deposit_code" IS 'Locker drop-off / deposit / PIN code from eAWB create-order response when provided';



CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "payment_provider" "text" DEFAULT 'netpopia'::"text" NOT NULL,
    "transaction_id" "text",
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'RON'::"text" NOT NULL,
    "payment_method" "text",
    "netopia_payment_id" "text",
    "netopia_order_id" "text",
    "provider_response" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checkout_session_id" "uuid"
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "collection_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "discount_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "image" "text",
    "category" "text",
    "stock" integer DEFAULT 0 NOT NULL,
    "sku" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "low_stock_threshold" integer DEFAULT 5 NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."low_stock_threshold" IS 'Threshold for low stock alerts. When stock <= threshold, product is considered low stock';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "store_name" "text",
    "store_api_key" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invoicing_provider" "text" DEFAULT 'oblio.eu'::"text",
    "shipping_provider" "text" DEFAULT 'sameday'::"text",
    "payment_provider" "text" DEFAULT 'netpopia'::"text",
    "oblio_api_key" "text",
    "oblio_name" "text",
    "oblio_email" "text",
    "sameday_api_key" "text",
    "sameday_name" "text",
    "sameday_email" "text",
    "netpopia_api_key" "text",
    "netpopia_name" "text",
    "netpopia_email" "text",
    "oblio_series_name" "text",
    "oblio_first_number" "text",
    "netpopia_signature" "text",
    "netpopia_pos_id" "text",
    "netpopia_sandbox" boolean DEFAULT true,
    "netpopia_public_key" "text",
    "woot_api_key" "text",
    "woot_name" "text",
    "woot_email" "text",
    "eawb_api_key" "text",
    "eawb_name" "text",
    "eawb_email" "text",
    "eawb_phone" "text",
    "eawb_address" "text",
    "eawb_billing_address_id" integer,
    "eawb_default_carrier_id" integer,
    "eawb_default_service_id" integer,
    "eawb_customer_id" integer,
    "eawb_city" "text",
    "eawb_county" "text",
    "eawb_street" "text",
    "eawb_street_number" "text",
    "cash_payment_enabled" boolean DEFAULT true,
    "cash_payment_fee" numeric(10,2) DEFAULT 0,
    "home_delivery_fee" numeric(10,2) DEFAULT 0,
    "locker_delivery_fee" numeric(10,2) DEFAULT 0,
    "setup_completed" boolean DEFAULT false,
    "welcome_dismissed" boolean DEFAULT false,
    "eawb_shipping_address_id" integer,
    "eawb_pickup_locker_id" "text",
    "eawb_pickup_locker_name" "text",
    "eawb_pickup_locker_address" "text",
    "eawb_pickup_locker_carrier_id" integer,
    "eawb_pickup_locker_carrier_code" "text",
    "eawb_pickup_locker_county" "text",
    "eawb_pickup_locker_city" "text",
    "preferred_language" "text" DEFAULT 'ro'::"text" NOT NULL,
    "onboarding_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "profiles_preferred_language_check" CHECK (("preferred_language" = ANY (ARRAY['ro'::"text", 'en'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."eawb_shipping_address_id" IS 'Europarcel shipping/pickup address ID used as address_from.address_from_id for AWB generation';



COMMENT ON COLUMN "public"."profiles"."eawb_pickup_locker_id" IS 'eAWB fixed_location_id used as merchant default pickup locker';



COMMENT ON COLUMN "public"."profiles"."preferred_language" IS 'Merchant UI and storefront locale preference (ro|en)';



COMMENT ON COLUMN "public"."profiles"."onboarding_state" IS 'Store setup wizard state: current_step, per-step status, selected_template';



CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "onesignal_player_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text",
    "rating" integer NOT NULL,
    "review_text" "text",
    "is_approved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "merchant_reply" "text",
    "merchant_replied_at" timestamp with time zone,
    "internal_notes" "text",
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "text" DEFAULT 'elementar'::"text" NOT NULL,
    "block_type" "text" NOT NULL,
    "block_order" integer DEFAULT 0 NOT NULL,
    "title" "text",
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."template_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_customization" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "text" DEFAULT 'elementar'::"text" NOT NULL,
    "primary_color" "text" DEFAULT '#000000'::"text",
    "background_color" "text" DEFAULT '#FFFFFF'::"text",
    "text_color" "text" DEFAULT '#000000'::"text",
    "accent_color" "text" DEFAULT '#666666'::"text",
    "hero_image_url" "text",
    "logo_url" "text",
    "hero_title" "text" DEFAULT 'Welcome to Our Store'::"text",
    "hero_subtitle" "text" DEFAULT 'Discover amazing products'::"text",
    "hero_button_text" "text" DEFAULT 'Shop now'::"text",
    "store_name" "text" DEFAULT 'My Store'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "font_family" "text" DEFAULT 'Inter'::"text",
    "heading_font" "text" DEFAULT 'Inter'::"text",
    "border_radius" "text" DEFAULT 'rounded-lg'::"text",
    "button_style" "text" DEFAULT 'solid'::"text",
    "hero_layout" "text" DEFAULT 'center'::"text",
    "product_card_style" "text" DEFAULT 'minimal'::"text",
    "show_collection_images" boolean DEFAULT true,
    "show_hero_section" boolean DEFAULT true,
    "navbar_style" "text" DEFAULT 'transparent'::"text",
    "footer_text" "text" DEFAULT 'All rights reserved.'::"text",
    "secondary_color" "text" DEFAULT '#F5F5F5'::"text",
    "gradient_enabled" boolean DEFAULT true,
    "animation_style" "text" DEFAULT 'smooth'::"text",
    "show_reviews" boolean DEFAULT true,
    "builder_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."template_customization" OWNER TO "postgres";


COMMENT ON COLUMN "public"."template_customization"."builder_config" IS 'Website builder config: homepage section order, visibility, and editor metadata';



ALTER TABLE ONLY "public"."carrier_services" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."carrier_services_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."carriers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."carriers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."abandoned_carts"
    ADD CONSTRAINT "abandoned_carts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carrier_services"
    ADD CONSTRAINT "carrier_services_carrier_id_service_code_key" UNIQUE ("carrier_id", "service_code");



ALTER TABLE ONLY "public"."carrier_services"
    ADD CONSTRAINT "carrier_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carriers"
    ADD CONSTRAINT "carriers_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."carriers"
    ADD CONSTRAINT "carriers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."carriers"
    ADD CONSTRAINT "carriers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkout_sessions"
    ADD CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collections"
    ADD CONSTRAINT "collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_collections"
    ADD CONSTRAINT "product_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_collections"
    ADD CONSTRAINT "product_collections_product_id_collection_id_key" UNIQUE ("product_id", "collection_id");



ALTER TABLE ONLY "public"."product_discounts"
    ADD CONSTRAINT "product_discounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_discounts"
    ADD CONSTRAINT "product_discounts_product_id_discount_id_key" UNIQUE ("product_id", "discount_id");



ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_device_token_key" UNIQUE ("user_id", "device_token");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_blocks"
    ADD CONSTRAINT "template_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_customization"
    ADD CONSTRAINT "template_customization_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_customization"
    ADD CONSTRAINT "template_customization_user_id_template_id_key" UNIQUE ("user_id", "template_id");



CREATE UNIQUE INDEX "idx_abandoned_carts_active_session" ON "public"."abandoned_carts" USING "btree" ("user_id", "session_token") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_abandoned_carts_user_email" ON "public"."abandoned_carts" USING "btree" ("user_id", "customer_email") WHERE ("customer_email" IS NOT NULL);



CREATE INDEX "idx_abandoned_carts_user_status_activity" ON "public"."abandoned_carts" USING "btree" ("user_id", "status", "last_activity_at" DESC);



CREATE INDEX "idx_checkout_sessions_expires" ON "public"."checkout_sessions" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_checkout_sessions_fingerprint" ON "public"."checkout_sessions" USING "btree" ("user_id", "customer_email", "cart_fingerprint", "status");



CREATE INDEX "idx_checkout_sessions_netopia_payment_id" ON "public"."checkout_sessions" USING "btree" ("netopia_payment_id") WHERE ("netopia_payment_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_checkout_sessions_order_id" ON "public"."checkout_sessions" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "idx_checkout_sessions_user_status" ON "public"."checkout_sessions" USING "btree" ("user_id", "status");



CREATE INDEX "idx_collections_user_id" ON "public"."collections" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_orders_checkout_session_id" ON "public"."orders" USING "btree" ("checkout_session_id") WHERE ("checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_orders_eawb_order_id" ON "public"."orders" USING "btree" ("eawb_order_id");



CREATE INDEX "idx_payment_transactions_checkout_session_id" ON "public"."payment_transactions" USING "btree" ("checkout_session_id") WHERE ("checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_product_collections_collection_id" ON "public"."product_collections" USING "btree" ("collection_id");



CREATE INDEX "idx_product_collections_product_id" ON "public"."product_collections" USING "btree" ("product_id");



CREATE INDEX "reviews_product_id_idx" ON "public"."reviews" USING "btree" ("product_id");



CREATE INDEX "reviews_user_status_idx" ON "public"."reviews" USING "btree" ("user_id", "status");



CREATE OR REPLACE TRIGGER "reviews_sync_is_approved" BEFORE INSERT OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."sync_review_is_approved"();



CREATE OR REPLACE TRIGGER "trigger_reduce_stock_on_order_paid" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."reduce_stock_on_order_paid"();



CREATE OR REPLACE TRIGGER "trigger_restore_stock_on_order_cancel" AFTER DELETE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."restore_product_stock_on_order_cancel"();



CREATE OR REPLACE TRIGGER "trigger_restore_stock_on_order_cancel" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."restore_stock_on_order_cancel"();



CREATE OR REPLACE TRIGGER "trigger_update_product_stock" AFTER INSERT OR DELETE OR UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_stock"();



CREATE OR REPLACE TRIGGER "update_abandoned_carts_updated_at" BEFORE UPDATE ON "public"."abandoned_carts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_carrier_services_updated_at" BEFORE UPDATE ON "public"."carrier_services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_carriers_updated_at" BEFORE UPDATE ON "public"."carriers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_checkout_sessions_updated_at" BEFORE UPDATE ON "public"."checkout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_collections_updated_at" BEFORE UPDATE ON "public"."collections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_discounts_updated_at" BEFORE UPDATE ON "public"."discounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payment_transactions_updated_at" BEFORE UPDATE ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_product_images_updated_at" BEFORE UPDATE ON "public"."product_images" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_push_tokens_updated_at" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_reviews_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_template_blocks_updated_at" BEFORE UPDATE ON "public"."template_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_template_customization_updated_at" BEFORE UPDATE ON "public"."template_customization" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."abandoned_carts"
    ADD CONSTRAINT "abandoned_carts_converted_checkout_session_id_fkey" FOREIGN KEY ("converted_checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."abandoned_carts"
    ADD CONSTRAINT "abandoned_carts_converted_order_id_fkey" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."abandoned_carts"
    ADD CONSTRAINT "abandoned_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."carrier_services"
    ADD CONSTRAINT "carrier_services_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkout_sessions"
    ADD CONSTRAINT "checkout_sessions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkout_sessions"
    ADD CONSTRAINT "checkout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_customization"
    ADD CONSTRAINT "template_customization_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can create reviews" ON "public"."reviews" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can view approved reviews" ON "public"."reviews" FOR SELECT USING (("is_approved" = true));



CREATE POLICY "Anyone can view blocks for template viewing" ON "public"."template_blocks" FOR SELECT USING (true);



CREATE POLICY "Anyone can view template customization for store API" ON "public"."template_customization" FOR SELECT USING (true);



CREATE POLICY "Carrier services are publicly viewable" ON "public"."carrier_services" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Carriers are publicly viewable" ON "public"."carriers" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Store owners can delete their reviews" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Store owners can update their reviews" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Store owners can view all reviews for their products" ON "public"."reviews" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create images for their products" ON "public"."product_images" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_images"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create order items for their orders" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create orders for their store" ON "public"."orders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create payment transactions for their orders" ON "public"."payment_transactions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "payment_transactions"."order_id") AND ("orders"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create product collections for their products" ON "public"."product_collections" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_collections"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create product discounts for their products" ON "public"."product_discounts" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_discounts"."product_id") AND ("products"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."discounts"
  WHERE (("discounts"."id" = "product_discounts"."discount_id") AND ("discounts"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create their own blocks" ON "public"."template_blocks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own checkout sessions" ON "public"."checkout_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own collections" ON "public"."collections" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own discounts" ON "public"."discounts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own products" ON "public"."products" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete images for their products" ON "public"."product_images" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_images"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete product collections for their products" ON "public"."product_collections" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_collections"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete product discounts for their products" ON "public"."product_discounts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_discounts"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own abandoned carts" ON "public"."abandoned_carts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own blocks" ON "public"."template_blocks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own collections" ON "public"."collections" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own discounts" ON "public"."discounts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own products" ON "public"."products" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own push tokens" ON "public"."push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own template customization" ON "public"."template_customization" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own push tokens" ON "public"."push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own template customization" ON "public"."template_customization" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update images for their products" ON "public"."product_images" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_images"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own abandoned carts" ON "public"."abandoned_carts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own blocks" ON "public"."template_blocks" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own checkout sessions" ON "public"."checkout_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own collections" ON "public"."collections" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own discounts" ON "public"."discounts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own orders" ON "public"."orders" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own payment transactions" ON "public"."payment_transactions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own products" ON "public"."products" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own push tokens" ON "public"."push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own template customization" ON "public"."template_customization" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view images for their products" ON "public"."product_images" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_images"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view order items for their orders" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view product collections for their products" ON "public"."product_collections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_collections"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view product discounts for their products" ON "public"."product_discounts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_discounts"."product_id") AND ("products"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own abandoned carts" ON "public"."abandoned_carts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own blocks" ON "public"."template_blocks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own checkout sessions" ON "public"."checkout_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own collections" ON "public"."collections" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own discounts" ON "public"."discounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own orders" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own payment transactions" ON "public"."payment_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own products" ON "public"."products" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own push tokens" ON "public"."push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own template customization" ON "public"."template_customization" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."abandoned_carts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."carrier_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."carriers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkout_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_customization" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_update_stock"("updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_update_stock"("updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_update_stock"("updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_abandoned_carts"("p_keep_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_abandoned_carts"("p_keep_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_abandoned_carts"("p_keep_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_checkout_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_checkout_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_checkout_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_checkout_session_to_order"("p_session_id" "uuid", "p_netopia_payment_id" "text", "p_provider_response" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_checkout_session_to_order"("p_session_id" "uuid", "p_netopia_payment_id" "text", "p_provider_response" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_checkout_session_to_order"("p_session_id" "uuid", "p_netopia_payment_id" "text", "p_provider_response" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_abandoned_carts"("p_idle_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."expire_abandoned_carts"("p_idle_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_abandoned_carts"("p_idle_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_checkout_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_checkout_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_checkout_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reduce_stock_on_order_paid"() TO "anon";
GRANT ALL ON FUNCTION "public"."reduce_stock_on_order_paid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reduce_stock_on_order_paid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_product_stock_on_order_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_product_stock_on_order_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_product_stock_on_order_cancel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_stock_on_order_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_stock_on_order_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_stock_on_order_cancel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_review_is_approved"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_review_is_approved"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_review_is_approved"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_product_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_product_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_stock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_product_stock_on_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_product_stock_on_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_stock_on_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."abandoned_carts" TO "anon";
GRANT ALL ON TABLE "public"."abandoned_carts" TO "authenticated";
GRANT ALL ON TABLE "public"."abandoned_carts" TO "service_role";



GRANT ALL ON TABLE "public"."carrier_services" TO "anon";
GRANT ALL ON TABLE "public"."carrier_services" TO "authenticated";
GRANT ALL ON TABLE "public"."carrier_services" TO "service_role";



GRANT ALL ON SEQUENCE "public"."carrier_services_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."carrier_services_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."carrier_services_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."carriers" TO "anon";
GRANT ALL ON TABLE "public"."carriers" TO "authenticated";
GRANT ALL ON TABLE "public"."carriers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."carriers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."carriers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."carriers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."checkout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."checkout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."checkout_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."collections" TO "anon";
GRANT ALL ON TABLE "public"."collections" TO "authenticated";
GRANT ALL ON TABLE "public"."collections" TO "service_role";



GRANT ALL ON TABLE "public"."discounts" TO "anon";
GRANT ALL ON TABLE "public"."discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."discounts" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."product_collections" TO "anon";
GRANT ALL ON TABLE "public"."product_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."product_collections" TO "service_role";



GRANT ALL ON TABLE "public"."product_discounts" TO "anon";
GRANT ALL ON TABLE "public"."product_discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."product_discounts" TO "service_role";



GRANT ALL ON TABLE "public"."product_images" TO "anon";
GRANT ALL ON TABLE "public"."product_images" TO "authenticated";
GRANT ALL ON TABLE "public"."product_images" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."template_blocks" TO "anon";
GRANT ALL ON TABLE "public"."template_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."template_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."template_customization" TO "anon";
GRANT ALL ON TABLE "public"."template_customization" TO "authenticated";
GRANT ALL ON TABLE "public"."template_customization" TO "service_role";



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







