export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      carrier_services: {
        Row: {
          carrier_id: number
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          name: string
          service_code: string
          updated_at: string
        }
        Insert: {
          carrier_id: number
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          name: string
          service_code: string
          updated_at?: string
        }
        Update: {
          carrier_id?: number
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          name?: string
          service_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_services_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          api_base_url: string
          code: string
          created_at: string
          id: number
          is_active: boolean
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          api_base_url: string
          code: string
          created_at?: string
          id?: number
          is_active?: boolean
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          api_base_url?: string
          code?: string
          created_at?: string
          id?: number
          is_active?: boolean
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_storefronts: {
        Row: {
          id: string
          user_id: string
          draft_spec: Json | null
          published_spec: Json | null
          draft_customization: Json | null
          status: string
          active: boolean
          version: number
          quality: string
          created_at: string
          updated_at: string
          published_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          draft_spec?: Json | null
          published_spec?: Json | null
          draft_customization?: Json | null
          status?: string
          active?: boolean
          version?: number
          quality?: string
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          draft_spec?: Json | null
          published_spec?: Json | null
          draft_customization?: Json | null
          status?: string
          active?: boolean
          version?: number
          quality?: string
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          id: string
          user_id: string
          storefront_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          storefront_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          storefront_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: string
          content: string | null
          brief_json: Json | null
          spec_json: Json | null
          patches_json: Json | null
          model: string | null
          prompt_tokens: number | null
          completion_tokens: number | null
          estimated_cost_usd: number | null
          quality: string | null
          kind: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          role: string
          content?: string | null
          brief_json?: Json | null
          spec_json?: Json | null
          patches_json?: Json | null
          model?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          estimated_cost_usd?: number | null
          quality?: string | null
          kind?: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          role?: string
          content?: string | null
          brief_json?: Json | null
          spec_json?: Json | null
          patches_json?: Json | null
          model?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          estimated_cost_usd?: number | null
          quality?: string | null
          kind?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          bucket: string
          created_at: string
          height: number | null
          id: string
          media_type: string
          mime_type: string
          original_size_bytes: number | null
          public_url: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          size_bytes: number
          status: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          user_id: string
          width: number | null
          delete_attempted_at: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          height?: number | null
          id?: string
          media_type: string
          mime_type: string
          original_size_bytes?: number | null
          public_url?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          user_id: string
          width?: number | null
          delete_attempted_at?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          height?: number | null
          id?: string
          media_type?: string
          mime_type?: string
          original_size_bytes?: number | null
          public_url?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_pricing_settings: {
        Row: {
          user_id: string
          enabled: boolean
          coverage_mode: string
          covered_counties: string[]
          covered_localities: Json
          pricing_mode: string
          distance_charge: string
          max_distance_km: number | null
          origin_street: string | null
          origin_street_number: string | null
          origin_city: string | null
          origin_county: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          enabled?: boolean
          coverage_mode?: string
          covered_counties?: string[]
          covered_localities?: Json
          pricing_mode?: string
          distance_charge?: string
          max_distance_km?: number | null
          origin_street?: string | null
          origin_street_number?: string | null
          origin_city?: string | null
          origin_county?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          enabled?: boolean
          coverage_mode?: string
          covered_counties?: string[]
          covered_localities?: Json
          pricing_mode?: string
          distance_charge?: string
          max_distance_km?: number | null
          origin_street?: string | null
          origin_street_number?: string | null
          origin_city?: string | null
          origin_county?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_pricing_rules: {
        Row: {
          id: string
          user_id: string
          county: string | null
          locality: string | null
          min_distance_km: number
          max_distance_km: number
          price_per_unit: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          county?: string | null
          locality?: string | null
          min_distance_km?: number
          max_distance_km: number
          price_per_unit: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          county?: string | null
          locality?: string | null
          min_distance_km?: number
          max_distance_km?: number
          price_per_unit?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_order_value_rules: {
        Row: {
          id: string
          user_id: string
          min_order_value: number
          max_order_value: number | null
          delivery_fee: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          min_order_value?: number
          max_order_value?: number | null
          delivery_fee: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          min_order_value?: number
          max_order_value?: number | null
          delivery_fee?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      discounts: {
        Row: {
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_price: number
          product_title: string
          quantity: number
          variant_id: string | null
          variant_options: Json | null
          variant_sku: string | null
          variant_title: string | null
          image_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_price: number
          product_title: string
          quantity: number
          variant_id?: string | null
          variant_options?: Json | null
          variant_sku?: string | null
          variant_title?: string | null
          image_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_price?: number
          product_title?: string
          quantity?: number
          variant_id?: string | null
          variant_options?: Json | null
          variant_sku?: string | null
          variant_title?: string | null
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          awb_number: string | null
          carrier_name: string | null
          checkout_session_id: string | null
          created_at: string
          customer_address: string
          customer_apartment: string | null
          billing_same_as_delivery: boolean
          billing_address: string | null
          billing_city: string | null
          billing_county: string | null
          billing_street: string | null
          billing_street_number: string | null
          billing_block: string | null
          billing_apartment: string | null
          customer_block: string | null
          customer_city: string | null
          customer_county: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          customer_street: string | null
          customer_street_number: string | null
          delivery_type: string | null
          eawb_order_id: number | null
          estimated_delivery_date: string | null
          id: string
          invoice_link: string | null
          invoice_number: string | null
          invoice_series: string | null
          locker_address: string | null
          locker_id: string | null
          locker_name: string | null
          locker_deposit_code: string | null
          awb_label_url: string | null
          awb_service_name: string | null
          awb_service_id: number | null
          awb_carrier_id: number | null
          awb_shipping_cost: number | null
          awb_cod_amount: number | null
          awb_response_extra: Json | null
          order_status: Database["public"]["Enums"]["order_status_enum"] | null
          payment_status: string
          selected_carrier_code: string | null
          shipping_status: string
          stock_applied_at: string | null
          stock_restored_at: string | null
          stock_shortfall: Json | null
          total: number
          tracking_url: string | null
          updated_at: string
          user_id: string
          customer_notes: string | null
          delivery_fee: number | null
          delivery_distance_km: number | null
          delivery_pricing_snapshot: Json | null
        }
        Insert: {
          awb_number?: string | null
          carrier_name?: string | null
          checkout_session_id?: string | null
          created_at?: string
          customer_address: string
          customer_apartment?: string | null
          customer_block?: string | null
          customer_city?: string | null
          customer_county?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          billing_same_as_delivery?: boolean
          billing_address?: string | null
          billing_city?: string | null
          billing_county?: string | null
          billing_street?: string | null
          billing_street_number?: string | null
          billing_block?: string | null
          billing_apartment?: string | null
          delivery_type?: string | null
          eawb_order_id?: number | null
          estimated_delivery_date?: string | null
          id?: string
          invoice_link?: string | null
          invoice_number?: string | null
          invoice_series?: string | null
          locker_id?: string | null
          locker_name?: string | null
          locker_address?: string | null
          locker_deposit_code?: string | null
          awb_label_url?: string | null
          awb_service_name?: string | null
          awb_service_id?: number | null
          awb_carrier_id?: number | null
          awb_shipping_cost?: number | null
          awb_cod_amount?: number | null
          awb_response_extra?: Json | null
          order_status?: Database["public"]["Enums"]["order_status_enum"] | null
          payment_status?: string
          selected_carrier_code?: string | null
          shipping_status?: string
          stock_applied_at?: string | null
          stock_restored_at?: string | null
          stock_shortfall?: Json | null
          total: number
          tracking_url?: string | null
          updated_at?: string
          user_id: string
          customer_notes?: string | null
          delivery_fee?: number | null
          delivery_distance_km?: number | null
          delivery_pricing_snapshot?: Json | null
        }
        Update: {
          awb_number?: string | null
          carrier_name?: string | null
          checkout_session_id?: string | null
          created_at?: string
          customer_address?: string
          customer_apartment?: string | null
          customer_block?: string | null
          customer_city?: string | null
          customer_county?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          billing_same_as_delivery?: boolean
          billing_address?: string | null
          billing_city?: string | null
          billing_county?: string | null
          billing_street?: string | null
          billing_street_number?: string | null
          billing_block?: string | null
          billing_apartment?: string | null
          delivery_type?: string | null
          eawb_order_id?: number | null
          estimated_delivery_date?: string | null
          id?: string
          invoice_link?: string | null
          invoice_number?: string | null
          invoice_series?: string | null
          locker_address?: string | null
          locker_id?: string | null
          locker_name?: string | null
          locker_deposit_code?: string | null
          awb_label_url?: string | null
          awb_service_name?: string | null
          awb_service_id?: number | null
          awb_carrier_id?: number | null
          awb_shipping_cost?: number | null
          awb_cod_amount?: number | null
          awb_response_extra?: Json | null
          order_status?: Database["public"]["Enums"]["order_status_enum"] | null
          payment_status?: string
          selected_carrier_code?: string | null
          shipping_status?: string
          stock_applied_at?: string | null
          stock_restored_at?: string | null
          stock_shortfall?: Json | null
          total?: number
          tracking_url?: string | null
          updated_at?: string
          user_id?: string
          customer_notes?: string | null
          delivery_fee?: number | null
          delivery_distance_km?: number | null
          delivery_pricing_snapshot?: Json | null
        }
        Relationships: []
      }
      payment_integrations: {
        Row: {
          id: string
          user_id: string
          provider: string
          enabled: boolean
          status: string
          provider_account_id: string | null
          livemode: boolean
          charges_enabled: boolean
          payouts_enabled: boolean
          details_submitted: boolean
          disabled_reason: string | null
          metadata: Json
          connected_at: string | null
          disconnected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          enabled?: boolean
          status?: string
          provider_account_id?: string | null
          livemode?: boolean
          charges_enabled?: boolean
          payouts_enabled?: boolean
          details_submitted?: boolean
          disabled_reason?: string | null
          metadata?: Json
          connected_at?: string | null
          disconnected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          enabled?: boolean
          status?: string
          provider_account_id?: string | null
          livemode?: boolean
          charges_enabled?: boolean
          payouts_enabled?: boolean
          details_submitted?: boolean
          disabled_reason?: string | null
          metadata?: Json
          connected_at?: string | null
          disconnected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          checkout_session_id: string | null
          created_at: string
          currency: string
          error_message: string | null
          id: string
          netopia_order_id: string | null
          netopia_payment_id: string | null
          order_id: string | null
          payment_method: string | null
          payment_provider: string
          payment_status: string
          provider_response: Json | null
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          checkout_session_id?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          netopia_order_id?: string | null
          netopia_payment_id?: string | null
          order_id?: string | null
          payment_method?: string | null
          payment_provider?: string
          payment_status?: string
          provider_response?: Json | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          checkout_session_id?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          netopia_order_id?: string | null
          netopia_payment_id?: string | null
          order_id?: string | null
          payment_method?: string | null
          payment_provider?: string
          payment_status?: string
          provider_response?: Json | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: []
      }
      product_discounts: {
        Row: {
          created_at: string
          discount_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          discount_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          discount_id?: string
          id?: string
          product_id?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_primary: boolean
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_primary?: boolean
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_primary?: boolean
          product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_options: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          position: number
          product_id: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          position?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          position?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_option_values: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          option_id: string
          position: number
          swatch_hex: string | null
          value: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          option_id: string
          position?: number
          swatch_hex?: string | null
          value: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          option_id?: string
          position?: number
          swatch_hex?: string | null
          value?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean
          barcode: string | null
          created_at: string
          id: string
          low_stock_threshold: number | null
          option_key: string
          position: number
          price_override: number | null
          product_id: string
          sku: string | null
          stock: number
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          low_stock_threshold?: number | null
          option_key: string
          position?: number
          price_override?: number | null
          product_id: string
          sku?: string | null
          stock?: number
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          low_stock_threshold?: number | null
          option_key?: string
          position?: number
          price_override?: number | null
          product_id?: string
          sku?: string | null
          stock?: number
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: []
      }
      product_option_value_images: {
        Row: {
          created_at: string
          image_id: string
          option_value_id: string
          position: number
        }
        Insert: {
          created_at?: string
          image_id: string
          option_value_id: string
          position?: number
        }
        Update: {
          created_at?: string
          image_id?: string
          option_value_id?: string
          position?: number
        }
        Relationships: []
      }
      product_variant_values: {
        Row: {
          option_id: string
          option_value_id: string
          variant_id: string
        }
        Insert: {
          option_id: string
          option_value_id: string
          variant_id: string
        }
        Update: {
          option_id?: string
          option_value_id?: string
          variant_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image: string | null
          low_stock_threshold: number
          price: number
          sku: string | null
          stock: number
          title: string
          updated_at: string
          user_id: string
          show_stock_to_customers: boolean | null
          has_variants: boolean
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          low_stock_threshold?: number
          price: number
          sku?: string | null
          stock?: number
          title: string
          updated_at?: string
          user_id: string
          show_stock_to_customers?: boolean | null
          has_variants?: boolean
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          low_stock_threshold?: number
          price?: number
          sku?: string | null
          stock?: number
          title?: string
          updated_at?: string
          user_id?: string
          show_stock_to_customers?: boolean | null
          has_variants?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cash_payment_enabled: boolean | null
          cash_payment_fee: number | null
          created_at: string
          eawb_address: string | null
          eawb_api_key: string | null
          eawb_billing_address_id: number | null
          eawb_shipping_address_id: number | null
          eawb_pickup_locker_id: string | null
          eawb_pickup_locker_name: string | null
          eawb_pickup_locker_address: string | null
          eawb_pickup_locker_carrier_id: number | null
          eawb_pickup_locker_carrier_code: string | null
          eawb_pickup_locker_county: string | null
          eawb_pickup_locker_city: string | null
          eawb_city: string | null
          eawb_county: string | null
          eawb_customer_id: number | null
          eawb_default_carrier_id: number | null
          eawb_default_service_id: number | null
          eawb_email: string | null
          eawb_name: string | null
          eawb_phone: string | null
          eawb_street: string | null
          eawb_street_number: string | null
          home_delivery_fee: number | null
          id: string
          invoicing_provider: string | null
          locker_delivery_fee: number | null
          netpopia_api_key: string | null
          netpopia_email: string | null
          netpopia_name: string | null
          netpopia_pos_id: string | null
          netpopia_public_key: string | null
          netpopia_sandbox: boolean | null
          netpopia_signature: string | null
          oblio_api_key: string | null
          oblio_email: string | null
          oblio_first_number: string | null
          oblio_name: string | null
          oblio_series_name: string | null
          onboarding_state: Record<string, unknown>
          payment_provider: string | null
          preferred_language: string
          sameday_api_key: string | null
          sameday_email: string | null
          sameday_name: string | null
          setup_completed: boolean | null
          shipping_provider: string | null
          store_api_key: string
          store_name: string | null
          updated_at: string
          user_id: string
          welcome_dismissed: boolean | null
          woot_api_key: string | null
          woot_email: string | null
          woot_name: string | null
          show_stock_to_customers: boolean
          allow_order_notes: boolean
          active_template: string
        }
        Insert: {
          cash_payment_enabled?: boolean | null
          cash_payment_fee?: number | null
          created_at?: string
          eawb_address?: string | null
          eawb_api_key?: string | null
          eawb_billing_address_id?: number | null
          eawb_shipping_address_id?: number | null
          eawb_pickup_locker_id?: string | null
          eawb_pickup_locker_name?: string | null
          eawb_pickup_locker_address?: string | null
          eawb_pickup_locker_carrier_id?: number | null
          eawb_pickup_locker_carrier_code?: string | null
          eawb_pickup_locker_county?: string | null
          eawb_pickup_locker_city?: string | null
          eawb_city?: string | null
          eawb_county?: string | null
          eawb_customer_id?: number | null
          eawb_default_carrier_id?: number | null
          eawb_default_service_id?: number | null
          eawb_email?: string | null
          eawb_name?: string | null
          eawb_phone?: string | null
          eawb_street?: string | null
          eawb_street_number?: string | null
          home_delivery_fee?: number | null
          id?: string
          invoicing_provider?: string | null
          locker_delivery_fee?: number | null
          netpopia_api_key?: string | null
          netpopia_email?: string | null
          netpopia_name?: string | null
          netpopia_pos_id?: string | null
          netpopia_public_key?: string | null
          netpopia_sandbox?: boolean | null
          netpopia_signature?: string | null
          oblio_api_key?: string | null
          oblio_email?: string | null
          oblio_first_number?: string | null
          oblio_name?: string | null
          oblio_series_name?: string | null
          onboarding_state?: Record<string, unknown>
          payment_provider?: string | null
          preferred_language?: string
          sameday_api_key?: string | null
          sameday_email?: string | null
          sameday_name?: string | null
          setup_completed?: boolean | null
          shipping_provider?: string | null
          store_api_key?: string
          store_name?: string | null
          updated_at?: string
          user_id: string
          welcome_dismissed?: boolean | null
          woot_api_key?: string | null
          woot_email?: string | null
          woot_name?: string | null
          show_stock_to_customers?: boolean
          allow_order_notes?: boolean
          active_template?: string
        }
        Update: {
          cash_payment_enabled?: boolean | null
          cash_payment_fee?: number | null
          created_at?: string
          eawb_address?: string | null
          eawb_api_key?: string | null
          eawb_billing_address_id?: number | null
          eawb_shipping_address_id?: number | null
          eawb_pickup_locker_id?: string | null
          eawb_pickup_locker_name?: string | null
          eawb_pickup_locker_address?: string | null
          eawb_pickup_locker_carrier_id?: number | null
          eawb_pickup_locker_carrier_code?: string | null
          eawb_pickup_locker_county?: string | null
          eawb_pickup_locker_city?: string | null
          eawb_city?: string | null
          eawb_county?: string | null
          eawb_customer_id?: number | null
          eawb_default_carrier_id?: number | null
          eawb_default_service_id?: number | null
          eawb_email?: string | null
          eawb_name?: string | null
          eawb_phone?: string | null
          eawb_street?: string | null
          eawb_street_number?: string | null
          home_delivery_fee?: number | null
          id?: string
          invoicing_provider?: string | null
          locker_delivery_fee?: number | null
          netpopia_api_key?: string | null
          netpopia_email?: string | null
          netpopia_name?: string | null
          netpopia_pos_id?: string | null
          netpopia_public_key?: string | null
          netpopia_sandbox?: boolean | null
          netpopia_signature?: string | null
          oblio_api_key?: string | null
          oblio_email?: string | null
          oblio_first_number?: string | null
          oblio_name?: string | null
          oblio_series_name?: string | null
          onboarding_state?: Record<string, unknown>
          payment_provider?: string | null
          preferred_language?: string
          sameday_api_key?: string | null
          sameday_email?: string | null
          sameday_name?: string | null
          setup_completed?: boolean | null
          shipping_provider?: string | null
          store_api_key?: string
          store_name?: string | null
          updated_at?: string
          user_id?: string
          welcome_dismissed?: boolean | null
          woot_api_key?: string | null
          woot_email?: string | null
          woot_name?: string | null
          show_stock_to_customers?: boolean
          allow_order_notes?: boolean
          active_template?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          device_token: string
          id: string
          is_active: boolean
          onesignal_player_id: string | null
          platform: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          device_token: string
          id?: string
          is_active?: boolean
          onesignal_player_id?: string | null
          platform: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          device_token?: string
          id?: string
          is_active?: boolean
          onesignal_player_id?: string | null
          platform?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string
          id: string
          internal_notes: string | null
          is_approved: boolean
          merchant_replied_at: string | null
          merchant_reply: string | null
          product_id: string
          rating: number
          review_text: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name: string
          id?: string
          internal_notes?: string | null
          is_approved?: boolean
          merchant_replied_at?: string | null
          merchant_reply?: string | null
          product_id: string
          rating: number
          review_text?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          id?: string
          internal_notes?: string | null
          is_approved?: boolean
          merchant_replied_at?: string | null
          merchant_reply?: string | null
          product_id?: string
          rating?: number
          review_text?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      template_blocks: {
        Row: {
          block_order: number
          block_type: string
          content: Json
          created_at: string
          id: string
          is_visible: boolean
          template_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          block_order?: number
          block_type: string
          content?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          template_id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          block_order?: number
          block_type?: string
          content?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          template_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_customization: {
        Row: {
          accent_color: string | null
          animation_style: string | null
          background_color: string | null
          border_radius: string | null
          builder_config: Record<string, unknown> | null
          button_style: string | null
          created_at: string
          font_family: string | null
          footer_text: string | null
          gradient_enabled: boolean | null
          heading_font: string | null
          hero_button_text: string | null
          hero_image_url: string | null
          hero_layout: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          logo_url: string | null
          navbar_style: string | null
          primary_color: string | null
          product_card_style: string | null
          secondary_color: string | null
          show_collection_images: boolean | null
          show_hero_section: boolean | null
          show_reviews: boolean | null
          store_name: string | null
          template_id: string
          text_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          animation_style?: string | null
          background_color?: string | null
          border_radius?: string | null
          builder_config?: Record<string, unknown> | null
          button_style?: string | null
          created_at?: string
          font_family?: string | null
          footer_text?: string | null
          gradient_enabled?: boolean | null
          heading_font?: string | null
          hero_button_text?: string | null
          hero_image_url?: string | null
          hero_layout?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          logo_url?: string | null
          navbar_style?: string | null
          primary_color?: string | null
          product_card_style?: string | null
          secondary_color?: string | null
          show_collection_images?: boolean | null
          show_hero_section?: boolean | null
          show_reviews?: boolean | null
          store_name?: string | null
          template_id?: string
          text_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          animation_style?: string | null
          background_color?: string | null
          border_radius?: string | null
          builder_config?: Record<string, unknown> | null
          button_style?: string | null
          created_at?: string
          font_family?: string | null
          footer_text?: string | null
          gradient_enabled?: boolean | null
          heading_font?: string | null
          hero_button_text?: string | null
          hero_image_url?: string | null
          hero_layout?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          logo_url?: string | null
          navbar_style?: string | null
          primary_color?: string | null
          product_card_style?: string | null
          secondary_color?: string | null
          show_collection_images?: boolean | null
          show_hero_section?: boolean | null
          show_reviews?: boolean | null
          store_name?: string | null
          template_id?: string
          text_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      product_variant_stats: {
        Row: {
          active_stock: number | null
          active_variant_count: number | null
          has_variants: boolean | null
          max_price: number | null
          min_price: number | null
          product_id: string | null
          variant_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_media_usage: {
        Args: { p_acting_as?: string | null }
        Returns: Json
      }
      get_my_entitlement_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_my_trial_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_trial_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_get_user_overview: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_extend_trial: {
        Args: {
          p_user_id: string
          p_days?: number | null
          p_new_end?: string | null
          p_reason?: string | null
        }
        Returns: Json
      }
      admin_list_trials: {
        Args: {
          p_filter?: string
          p_search?: string | null
          p_sort?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          user_id: string
          email: string | null
          user_name: string | null
          merchant_id: string | null
          store_name: string | null
          signed_up_at: string
          trial_started_at: string
          trial_ends_at: string
          days_remaining: number
          subscription_status: string
          current_plan: string | null
          last_sign_in_at: string | null
          total_count: number
        }[]
      }
      admin_list_merchants: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          store_name: string
          email: string
          setup_completed: boolean
          active_template: string
          shipping_provider: string
          payment_provider: string
          created_at: string
          order_count: number
          product_count: number
        }[]
      }
      bulk_update_stock: {
        Args: { updates: Json }
        Returns: {
          error_message: string
          new_stock: number
          old_stock: number
          product_id: string
          success: boolean
        }[]
      }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_superadmin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_superadmin_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      apply_order_stock: {
        Args: { p_order_id: string; p_mode?: string }
        Returns: Json
      }
      consume_stripe_connect_state: {
        Args: { p_state: string }
        Returns: {
          id: string
          user_id: string
          state: string
          return_to: string
          expires_at: string
          consumed_at: string | null
          created_at: string
        }
      }
      convert_checkout_session_to_order: {
        Args: {
          p_session_id: string
          p_netopia_payment_id?: string
          p_provider_response?: Json
        }
        Returns: Json
      }
      create_cod_order: {
        Args: { p_order: Json; p_items: Json }
        Returns: Json
      }
      lock_products_for_items: {
        Args: { p_items: Json }
        Returns: undefined
      }
      restore_order_stock: {
        Args: { p_order_id: string; p_cancel_order?: boolean }
        Returns: Json
      }
      save_product_variants: {
        Args: { p_product_id: string; p_payload: Json }
        Returns: Json
      }
      product_variant_limits: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
    }
    Enums: {
      app_role: "superadmin"
      order_status_enum: "draft" | "awaiting_payment" | "paid" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["superadmin"],
      order_status_enum: ["draft", "awaiting_payment", "paid", "cancelled"],
    },
  },
} as const
