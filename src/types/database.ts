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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          cart_subtotal: number
          checkout_step: string
          converted_at: string | null
          converted_checkout_session_id: string | null
          converted_order_id: string | null
          created_at: string
          customer_address: string | null
          customer_apartment: string | null
          customer_block: string | null
          customer_city: string | null
          customer_county: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_street: string | null
          customer_street_number: string | null
          delivery_type: string | null
          estimated_total: number
          id: string
          items: Json
          last_activity_at: string
          locker_address: string | null
          locker_id: string | null
          locker_name: string | null
          payment_method: string | null
          recovered_at: string | null
          selected_carrier_code: string | null
          session_token: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cart_subtotal?: number
          checkout_step?: string
          converted_at?: string | null
          converted_checkout_session_id?: string | null
          converted_order_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_apartment?: string | null
          customer_block?: string | null
          customer_city?: string | null
          customer_county?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          delivery_type?: string | null
          estimated_total?: number
          id?: string
          items?: Json
          last_activity_at?: string
          locker_address?: string | null
          locker_id?: string | null
          locker_name?: string | null
          payment_method?: string | null
          recovered_at?: string | null
          selected_carrier_code?: string | null
          session_token: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cart_subtotal?: number
          checkout_step?: string
          converted_at?: string | null
          converted_checkout_session_id?: string | null
          converted_order_id?: string | null
          created_at?: string
          customer_address?: string | null
          customer_apartment?: string | null
          customer_block?: string | null
          customer_city?: string | null
          customer_county?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          delivery_type?: string | null
          estimated_total?: number
          id?: string
          items?: Json
          last_activity_at?: string
          locker_address?: string | null
          locker_id?: string | null
          locker_name?: string | null
          payment_method?: string | null
          recovered_at?: string | null
          selected_carrier_code?: string | null
          session_token?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_converted_checkout_session_id_fkey"
            columns: ["converted_checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      access_code_redemptions: {
        Row: {
          code_id: string
          entitlement_id: string | null
          id: string
          metadata: Json
          redeemed_at: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          code_id: string
          entitlement_id?: string | null
          id?: string
          metadata?: Json
          redeemed_at?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          code_id?: string
          entitlement_id?: string | null
          id?: string
          metadata?: Json
          redeemed_at?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_code_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_redemptions_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["id"]
          },
        ]
      }
      access_codes: {
        Row: {
          access_duration_days: number | null
          active: boolean
          code_hash: string
          code_prefix: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string
          max_redemptions: number | null
          metadata: Json
          redemption_count: number
          updated_at: string
        }
        Insert: {
          access_duration_days?: number | null
          active?: boolean
          code_hash: string
          code_prefix: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          max_redemptions?: number | null
          metadata?: Json
          redemption_count?: number
          updated_at?: string
        }
        Update: {
          access_duration_days?: number | null
          active?: boolean
          code_hash?: string
          code_prefix?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          max_redemptions?: number | null
          metadata?: Json
          redemption_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          storefront_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          storefront_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          storefront_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "ai_storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          brief_json: Json | null
          completion_tokens: number | null
          content: string | null
          conversation_id: string
          created_at: string
          estimated_cost_usd: number | null
          id: string
          kind: string
          model: string | null
          patches_json: Json | null
          prompt_tokens: number | null
          quality: string | null
          role: string
          spec_json: Json | null
          status: string
          user_id: string
        }
        Insert: {
          brief_json?: Json | null
          completion_tokens?: number | null
          content?: string | null
          conversation_id: string
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          kind?: string
          model?: string | null
          patches_json?: Json | null
          prompt_tokens?: number | null
          quality?: string | null
          role: string
          spec_json?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          brief_json?: Json | null
          completion_tokens?: number | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          kind?: string
          model?: string | null
          patches_json?: Json | null
          prompt_tokens?: number | null
          quality?: string | null
          role?: string
          spec_json?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_storefronts: {
        Row: {
          active: boolean
          brand_design_system: Json | null
          created_at: string
          creative_mode: string
          design_spec: Json | null
          draft_customization: Json | null
          draft_document: Json | null
          draft_spec: Json | null
          id: string
          published_at: string | null
          published_document: Json | null
          published_spec: Json | null
          quality: string
          schema_version: number
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean
          brand_design_system?: Json | null
          created_at?: string
          creative_mode?: string
          design_spec?: Json | null
          draft_customization?: Json | null
          draft_document?: Json | null
          draft_spec?: Json | null
          id?: string
          published_at?: string | null
          published_document?: Json | null
          published_spec?: Json | null
          quality?: string
          schema_version?: number
          status?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean
          brand_design_system?: Json | null
          created_at?: string
          creative_mode?: string
          design_spec?: Json | null
          draft_customization?: Json | null
          draft_document?: Json | null
          draft_spec?: Json | null
          id?: string
          published_at?: string | null
          published_document?: Json | null
          published_spec?: Json | null
          quality?: string
          schema_version?: number
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          livemode: boolean
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          livemode?: boolean
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          livemode?: boolean
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          enforcement_enabled: boolean
          grace_period_days: number
          id: number
          updated_at: string
        }
        Insert: {
          enforcement_enabled?: boolean
          grace_period_days?: number
          id?: number
          updated_at?: string
        }
        Update: {
          enforcement_enabled?: boolean
          grace_period_days?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          billing_customer_id: string
          billing_interval: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          grace_until: string | null
          id: string
          latest_invoice_id: string | null
          livemode: boolean
          metadata: Json
          plan: string | null
          status: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string
          tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_customer_id: string
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_until?: string | null
          id?: string
          latest_invoice_id?: string | null
          livemode?: boolean
          metadata?: Json
          plan?: string | null
          status: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id: string
          tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_customer_id?: string
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_until?: string | null
          id?: string
          latest_invoice_id?: string | null
          livemode?: boolean
          metadata?: Json
          plan?: string | null
          status?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string
          tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      checkout_sessions: {
        Row: {
          billing_address: string | null
          billing_apartment: string | null
          billing_block: string | null
          billing_city: string | null
          billing_county: string | null
          billing_same_as_delivery: boolean
          billing_street: string | null
          billing_street_number: string | null
          cart_fingerprint: string
          created_at: string
          customer_address: string
          customer_apartment: string | null
          customer_block: string | null
          customer_city: string | null
          customer_county: string | null
          customer_email: string
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          customer_street: string | null
          customer_street_number: string | null
          delivery_distance_km: number | null
          delivery_pricing_snapshot: Json | null
          delivery_type: string | null
          discount_amount: number
          discount_code: string | null
          discount_meta: Json | null
          expires_at: string
          id: string
          items: Json
          locker_address: string | null
          locker_id: string | null
          locker_name: string | null
          netopia_payment_id: string | null
          netopia_payment_url: string | null
          order_id: string | null
          payment_method: string
          payment_status: string
          provider_response: Json | null
          selected_carrier_code: string | null
          shipping_amount: number
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_address?: string | null
          billing_apartment?: string | null
          billing_block?: string | null
          billing_city?: string | null
          billing_county?: string | null
          billing_same_as_delivery?: boolean
          billing_street?: string | null
          billing_street_number?: string | null
          cart_fingerprint: string
          created_at?: string
          customer_address: string
          customer_apartment?: string | null
          customer_block?: string | null
          customer_city?: string | null
          customer_county?: string | null
          customer_email: string
          customer_name: string
          customer_notes?: string | null
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          delivery_distance_km?: number | null
          delivery_pricing_snapshot?: Json | null
          delivery_type?: string | null
          discount_amount?: number
          discount_code?: string | null
          discount_meta?: Json | null
          expires_at: string
          id?: string
          items?: Json
          locker_address?: string | null
          locker_id?: string | null
          locker_name?: string | null
          netopia_payment_id?: string | null
          netopia_payment_url?: string | null
          order_id?: string | null
          payment_method?: string
          payment_status?: string
          provider_response?: Json | null
          selected_carrier_code?: string | null
          shipping_amount?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          total: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_address?: string | null
          billing_apartment?: string | null
          billing_block?: string | null
          billing_city?: string | null
          billing_county?: string | null
          billing_same_as_delivery?: boolean
          billing_street?: string | null
          billing_street_number?: string | null
          cart_fingerprint?: string
          created_at?: string
          customer_address?: string
          customer_apartment?: string | null
          customer_block?: string | null
          customer_city?: string | null
          customer_county?: string | null
          customer_email?: string
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          delivery_distance_km?: number | null
          delivery_pricing_snapshot?: Json | null
          delivery_type?: string | null
          discount_amount?: number
          discount_code?: string | null
          discount_meta?: Json | null
          expires_at?: string
          id?: string
          items?: Json
          locker_address?: string | null
          locker_id?: string | null
          locker_name?: string | null
          netopia_payment_id?: string | null
          netopia_payment_url?: string | null
          order_id?: string | null
          payment_method?: string
          payment_status?: string
          provider_response?: Json | null
          selected_carrier_code?: string | null
          shipping_amount?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      delivery_order_value_rules: {
        Row: {
          created_at: string
          delivery_fee: number
          id: string
          max_order_value: number | null
          min_order_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_fee: number
          id?: string
          max_order_value?: number | null
          min_order_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_fee?: number
          id?: string
          max_order_value?: number | null
          min_order_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_pricing_rules: {
        Row: {
          county: string | null
          created_at: string
          id: string
          locality: string | null
          max_distance_km: number
          min_distance_km: number
          price_per_unit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          county?: string | null
          created_at?: string
          id?: string
          locality?: string | null
          max_distance_km: number
          min_distance_km?: number
          price_per_unit: number
          updated_at?: string
          user_id: string
        }
        Update: {
          county?: string | null
          created_at?: string
          id?: string
          locality?: string | null
          max_distance_km?: number
          min_distance_km?: number
          price_per_unit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_pricing_settings: {
        Row: {
          coverage_mode: string
          covered_counties: string[]
          covered_localities: Json
          created_at: string
          distance_charge: string
          enabled: boolean
          max_distance_km: number | null
          origin_city: string | null
          origin_county: string | null
          origin_street: string | null
          origin_street_number: string | null
          pricing_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coverage_mode?: string
          covered_counties?: string[]
          covered_localities?: Json
          created_at?: string
          distance_charge?: string
          enabled?: boolean
          max_distance_km?: number | null
          origin_city?: string | null
          origin_county?: string | null
          origin_street?: string | null
          origin_street_number?: string | null
          pricing_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coverage_mode?: string
          covered_counties?: string[]
          covered_localities?: Json
          created_at?: string
          distance_charge?: string
          enabled?: boolean
          max_distance_km?: number | null
          origin_city?: string | null
          origin_county?: string | null
          origin_street?: string | null
          origin_street_number?: string | null
          pricing_mode?: string
          updated_at?: string
          user_id?: string
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
      entitlements: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          source: string
          source_ref: string | null
          status: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          source: string
          source_ref?: string | null
          status: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          source?: string
          source_ref?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          bucket: string
          created_at: string
          delete_attempted_at: string | null
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
        }
        Insert: {
          bucket: string
          created_at?: string
          delete_attempted_at?: string | null
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
        }
        Update: {
          bucket?: string
          created_at?: string
          delete_attempted_at?: string | null
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
      media_upload_reservations: {
        Row: {
          bucket: string
          created_at: string
          expected_size_bytes: number
          expires_at: string
          height: number | null
          id: string
          media_type: string
          mime_type: string
          original_size_bytes: number | null
          related_entity_id: string | null
          related_entity_type: string | null
          storage_path: string
          uploaded_by: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          bucket: string
          created_at?: string
          expected_size_bytes: number
          expires_at: string
          height?: number | null
          id?: string
          media_type: string
          mime_type: string
          original_size_bytes?: number | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          storage_path: string
          uploaded_by?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          bucket?: string
          created_at?: string
          expected_size_bytes?: number
          expires_at?: string
          height?: number | null
          id?: string
          media_type?: string
          mime_type?: string
          original_size_bytes?: number | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          storage_path?: string
          uploaded_by?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      media_usage: {
        Row: {
          bytes_reserved: number
          bytes_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bytes_reserved?: number
          bytes_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bytes_reserved?: number
          bytes_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          order_id: string
          product_id: string | null
          product_price: number
          product_title: string
          quantity: number
          returned_quantity: number
          variant_id: string | null
          variant_options: Json | null
          variant_sku: string | null
          variant_title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          order_id: string
          product_id?: string | null
          product_price: number
          product_title: string
          quantity: number
          returned_quantity?: number
          variant_id?: string | null
          variant_options?: Json | null
          variant_sku?: string | null
          variant_title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          order_id?: string
          product_id?: string | null
          product_price?: number
          product_title?: string
          quantity?: number
          returned_quantity?: number
          variant_id?: string | null
          variant_options?: Json | null
          variant_sku?: string | null
          variant_title?: string | null
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
            referencedRelation: "product_variant_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          awb_carrier_id: number | null
          awb_cod_amount: number | null
          awb_label_url: string | null
          awb_number: string | null
          awb_response_extra: Json | null
          awb_service_id: number | null
          awb_service_name: string | null
          awb_shipping_cost: number | null
          billing_address: string | null
          billing_apartment: string | null
          billing_block: string | null
          billing_city: string | null
          billing_county: string | null
          billing_same_as_delivery: boolean
          billing_street: string | null
          billing_street_number: string | null
          carrier_name: string | null
          checkout_session_id: string | null
          created_at: string
          customer_address: string
          customer_apartment: string | null
          customer_block: string | null
          customer_city: string | null
          customer_county: string | null
          customer_email: string
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          customer_street: string | null
          customer_street_number: string | null
          delivery_distance_km: number | null
          delivery_fee: number | null
          delivery_pricing_snapshot: Json | null
          delivery_type: string | null
          eawb_order_id: number | null
          estimated_delivery_date: string | null
          id: string
          invoice_link: string | null
          invoice_number: string | null
          invoice_series: string | null
          locker_address: string | null
          locker_deposit_code: string | null
          locker_id: string | null
          locker_name: string | null
          order_status: Database["public"]["Enums"]["order_status_enum"] | null
          payment_status: string
          return_status: string
          selected_carrier_code: string | null
          shipping_status: string
          stock_applied_at: string | null
          stock_restored_at: string | null
          stock_shortfall: Json | null
          total: number
          tracking_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          awb_carrier_id?: number | null
          awb_cod_amount?: number | null
          awb_label_url?: string | null
          awb_number?: string | null
          awb_response_extra?: Json | null
          awb_service_id?: number | null
          awb_service_name?: string | null
          awb_shipping_cost?: number | null
          billing_address?: string | null
          billing_apartment?: string | null
          billing_block?: string | null
          billing_city?: string | null
          billing_county?: string | null
          billing_same_as_delivery?: boolean
          billing_street?: string | null
          billing_street_number?: string | null
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
          customer_notes?: string | null
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number | null
          delivery_pricing_snapshot?: Json | null
          delivery_type?: string | null
          eawb_order_id?: number | null
          estimated_delivery_date?: string | null
          id?: string
          invoice_link?: string | null
          invoice_number?: string | null
          invoice_series?: string | null
          locker_address?: string | null
          locker_deposit_code?: string | null
          locker_id?: string | null
          locker_name?: string | null
          order_status?: Database["public"]["Enums"]["order_status_enum"] | null
          payment_status?: string
          return_status?: string
          selected_carrier_code?: string | null
          shipping_status?: string
          stock_applied_at?: string | null
          stock_restored_at?: string | null
          stock_shortfall?: Json | null
          total: number
          tracking_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          awb_carrier_id?: number | null
          awb_cod_amount?: number | null
          awb_label_url?: string | null
          awb_number?: string | null
          awb_response_extra?: Json | null
          awb_service_id?: number | null
          awb_service_name?: string | null
          awb_shipping_cost?: number | null
          billing_address?: string | null
          billing_apartment?: string | null
          billing_block?: string | null
          billing_city?: string | null
          billing_county?: string | null
          billing_same_as_delivery?: boolean
          billing_street?: string | null
          billing_street_number?: string | null
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
          customer_notes?: string | null
          customer_phone?: string | null
          customer_street?: string | null
          customer_street_number?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number | null
          delivery_pricing_snapshot?: Json | null
          delivery_type?: string | null
          eawb_order_id?: number | null
          estimated_delivery_date?: string | null
          id?: string
          invoice_link?: string | null
          invoice_number?: string | null
          invoice_series?: string | null
          locker_address?: string | null
          locker_deposit_code?: string | null
          locker_id?: string | null
          locker_name?: string | null
          order_status?: Database["public"]["Enums"]["order_status_enum"] | null
          payment_status?: string
          return_status?: string
          selected_carrier_code?: string | null
          shipping_status?: string
          stock_applied_at?: string | null
          stock_restored_at?: string | null
          stock_shortfall?: Json | null
          total?: number
          tracking_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_integrations: {
        Row: {
          charges_enabled: boolean
          connected_at: string | null
          created_at: string
          details_submitted: boolean
          disabled_reason: string | null
          disconnected_at: string | null
          enabled: boolean
          id: string
          livemode: boolean
          metadata: Json
          payouts_enabled: boolean
          provider: string
          provider_account_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean
          connected_at?: string | null
          created_at?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          disconnected_at?: string | null
          enabled?: boolean
          id?: string
          livemode?: boolean
          metadata?: Json
          payouts_enabled?: boolean
          provider: string
          provider_account_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean
          connected_at?: string | null
          created_at?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          disconnected_at?: string | null
          enabled?: boolean
          id?: string
          livemode?: boolean
          metadata?: Json
          payouts_enabled?: boolean
          provider?: string
          provider_account_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
            foreignKeyName: "payment_transactions_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
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
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_variant_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "product_option_value_images_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "product_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_value_images_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_variant_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "product_variant_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_values_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_values_option_value_option_fk"
            columns: ["option_value_id", "option_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id", "option_id"]
          },
          {
            foreignKeyName: "product_variant_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_variant_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          has_variants: boolean
          id: string
          image: string | null
          low_stock_threshold: number
          price: number
          show_stock_to_customers: boolean | null
          sku: string | null
          stock: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          has_variants?: boolean
          id?: string
          image?: string | null
          low_stock_threshold?: number
          price: number
          show_stock_to_customers?: boolean | null
          sku?: string | null
          stock?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          has_variants?: boolean
          id?: string
          image?: string | null
          low_stock_threshold?: number
          price?: number
          show_stock_to_customers?: boolean | null
          sku?: string | null
          stock?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_template: string
          allow_order_notes: boolean
          cash_payment_enabled: boolean | null
          cash_payment_fee: number | null
          created_at: string
          delivery_message: string | null
          eawb_address: string | null
          eawb_api_key: string | null
          eawb_billing_address_id: number | null
          eawb_city: string | null
          eawb_county: string | null
          eawb_customer_id: number | null
          eawb_default_carrier_id: number | null
          eawb_default_service_id: number | null
          eawb_email: string | null
          eawb_name: string | null
          eawb_phone: string | null
          eawb_pickup_locker_address: string | null
          eawb_pickup_locker_carrier_code: string | null
          eawb_pickup_locker_carrier_id: number | null
          eawb_pickup_locker_city: string | null
          eawb_pickup_locker_county: string | null
          eawb_pickup_locker_id: string | null
          eawb_pickup_locker_name: string | null
          eawb_shipping_address_id: number | null
          eawb_street: string | null
          eawb_street_number: string | null
          free_delivery: boolean
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
          onboarding_state: Json
          payment_provider: string | null
          preferred_language: string
          sameday_api_key: string | null
          sameday_email: string | null
          sameday_name: string | null
          setup_completed: boolean | null
          shipping_provider: string | null
          show_stock_to_customers: boolean
          store_api_key: string
          store_name: string | null
          updated_at: string
          user_id: string
          welcome_dismissed: boolean | null
          woot_api_key: string | null
          woot_email: string | null
          woot_name: string | null
        }
        Insert: {
          active_template?: string
          allow_order_notes?: boolean
          cash_payment_enabled?: boolean | null
          cash_payment_fee?: number | null
          created_at?: string
          delivery_message?: string | null
          eawb_address?: string | null
          eawb_api_key?: string | null
          eawb_billing_address_id?: number | null
          eawb_city?: string | null
          eawb_county?: string | null
          eawb_customer_id?: number | null
          eawb_default_carrier_id?: number | null
          eawb_default_service_id?: number | null
          eawb_email?: string | null
          eawb_name?: string | null
          eawb_phone?: string | null
          eawb_pickup_locker_address?: string | null
          eawb_pickup_locker_carrier_code?: string | null
          eawb_pickup_locker_carrier_id?: number | null
          eawb_pickup_locker_city?: string | null
          eawb_pickup_locker_county?: string | null
          eawb_pickup_locker_id?: string | null
          eawb_pickup_locker_name?: string | null
          eawb_shipping_address_id?: number | null
          eawb_street?: string | null
          eawb_street_number?: string | null
          free_delivery?: boolean
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
          onboarding_state?: Json
          payment_provider?: string | null
          preferred_language?: string
          sameday_api_key?: string | null
          sameday_email?: string | null
          sameday_name?: string | null
          setup_completed?: boolean | null
          shipping_provider?: string | null
          show_stock_to_customers?: boolean
          store_api_key?: string
          store_name?: string | null
          updated_at?: string
          user_id: string
          welcome_dismissed?: boolean | null
          woot_api_key?: string | null
          woot_email?: string | null
          woot_name?: string | null
        }
        Update: {
          active_template?: string
          allow_order_notes?: boolean
          cash_payment_enabled?: boolean | null
          cash_payment_fee?: number | null
          created_at?: string
          delivery_message?: string | null
          eawb_address?: string | null
          eawb_api_key?: string | null
          eawb_billing_address_id?: number | null
          eawb_city?: string | null
          eawb_county?: string | null
          eawb_customer_id?: number | null
          eawb_default_carrier_id?: number | null
          eawb_default_service_id?: number | null
          eawb_email?: string | null
          eawb_name?: string | null
          eawb_phone?: string | null
          eawb_pickup_locker_address?: string | null
          eawb_pickup_locker_carrier_code?: string | null
          eawb_pickup_locker_carrier_id?: number | null
          eawb_pickup_locker_city?: string | null
          eawb_pickup_locker_county?: string | null
          eawb_pickup_locker_id?: string | null
          eawb_pickup_locker_name?: string | null
          eawb_shipping_address_id?: number | null
          eawb_street?: string | null
          eawb_street_number?: string | null
          free_delivery?: boolean
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
          onboarding_state?: Json
          payment_provider?: string | null
          preferred_language?: string
          sameday_api_key?: string | null
          sameday_email?: string | null
          sameday_name?: string | null
          setup_completed?: boolean | null
          shipping_provider?: string | null
          show_stock_to_customers?: boolean
          store_api_key?: string
          store_name?: string | null
          updated_at?: string
          user_id?: string
          welcome_dismissed?: boolean | null
          woot_api_key?: string | null
          woot_email?: string | null
          woot_name?: string | null
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
            referencedRelation: "product_variant_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_billing_webhook_events: {
        Row: {
          attempt_count: number
          created_at: string
          event_type: string
          last_error: string | null
          lease_id: string | null
          payload_digest: string | null
          processed_at: string | null
          processing_started_at: string | null
          status: string
          stripe_event_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          event_type: string
          last_error?: string | null
          lease_id?: string | null
          payload_digest?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          status?: string
          stripe_event_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          event_type?: string
          last_error?: string | null
          lease_id?: string | null
          payload_digest?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          status?: string
          stripe_event_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_connect_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          return_to: string
          state: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          return_to?: string
          state: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          return_to?: string
          state?: string
          user_id?: string
        }
        Relationships: []
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
          builder_config: Json
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
          builder_config?: Json
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
          builder_config?: Json
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
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
      admin_list_merchants: {
        Args: never
        Returns: {
          active_template: string
          created_at: string
          email: string
          order_count: number
          payment_provider: string
          product_count: number
          setup_completed: boolean
          shipping_provider: string
          store_name: string
          user_id: string
        }[]
      }
      apply_option_value_images_from_payload: {
        Args: { p_payload: Json; p_product_id: string; p_val_map: Json }
        Returns: undefined
      }
      apply_order_stock: {
        Args: { p_mode?: string; p_order_id: string }
        Returns: Json
      }
      assert_items_owned_by: {
        Args: { p_items: Json; p_user_id: string }
        Returns: undefined
      }
      assert_speedvendors_entitlement: { Args: never; Returns: undefined }
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
      claim_stripe_billing_webhook_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_payload_digest?: string
          p_stale_after_seconds?: number
        }
        Returns: Json
      }
      cleanup_old_abandoned_carts: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      cleanup_old_checkout_sessions: { Args: never; Returns: number }
      complete_stripe_billing_webhook_event: {
        Args: {
          p_error?: string
          p_event_id: string
          p_lease_id?: string
          p_ok: boolean
        }
        Returns: Json
      }
      consume_stripe_connect_state: {
        Args: { p_state: string }
        Returns: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          return_to: string
          state: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stripe_connect_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      convert_checkout_session_to_order: {
        Args: {
          p_netopia_payment_id?: string
          p_provider_response?: Json
          p_session_id: string
        }
        Returns: Json
      }
      create_cod_order: {
        Args: { p_items: Json; p_order: Json }
        Returns: Json
      }
      expand_product_variant_combinations: {
        Args: { p_product_id: string }
        Returns: {
          option_ids: string[]
          option_key: string
          sort_position: number
          value_ids: string[]
        }[]
      }
      expire_abandoned_carts: {
        Args: { p_idle_days?: number }
        Returns: number
      }
      expire_checkout_sessions: { Args: never; Returns: number }
      expire_lapsed_stripe_grace: { Args: never; Returns: number }
      finalize_media_upload: {
        Args: {
          p_actual_size_bytes: number
          p_height?: number
          p_mime_type?: string
          p_public_url?: string
          p_reservation_id: string
          p_width?: number
        }
        Returns: Json
      }
      get_media_usage: { Args: { p_acting_as?: string }; Returns: Json }
      get_my_entitlement_status: { Args: never; Returns: Json }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      has_speedvendors_access: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_superadmin_user: { Args: never; Returns: boolean }
      lock_products_for_items: {
        Args: { p_items: Json; p_user_id: string }
        Returns: undefined
      }
      media_expire_reservations_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      media_quota_bytes_for_tier: { Args: { p_tier: string }; Returns: number }
      media_quota_for_user: {
        Args: { p_user_id: string }
        Returns: {
          quota_bytes: number
          tier: string
        }[]
      }
      media_storage_object_size: {
        Args: { p_bucket: string; p_path: string }
        Returns: number
      }
      merchant_owns_product: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      merchant_owns_product_option: {
        Args: { p_option_id: string }
        Returns: boolean
      }
      merchant_owns_product_variant: {
        Args: { p_variant_id: string }
        Returns: boolean
      }
      product_variant_limits: { Args: never; Returns: Json }
      record_media_deletion: { Args: { p_asset_id: string }; Returns: Json }
      redeem_access_code_hash: {
        Args: { p_code_hash: string; p_user_id?: string }
        Returns: Json
      }
      release_media_reservation: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      reserve_media_upload: {
        Args: {
          p_bucket: string
          p_height?: number
          p_media_type: string
          p_mime_type: string
          p_original_size_bytes?: number
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_requested_bytes: number
          p_storage_path: string
          p_uploaded_by?: string
          p_user_id: string
          p_width?: number
        }
        Returns: Json
      }
      resolve_acting_user_id: {
        Args: { p_acting_as?: string }
        Returns: string
      }
      restore_order_stock: {
        Args: { p_cancel_order?: boolean; p_order_id: string }
        Returns: Json
      }
      return_order_items: {
        Args: {
          p_cancel_if_full?: boolean
          p_items: Json
          p_mark_refunded?: boolean
          p_notes?: string
          p_order_id: string
        }
        Returns: Json
      }
      save_product_variants: {
        Args: { p_payload: Json; p_product_id: string }
        Returns: Json
      }
      sync_billing_subscription_from_stripe: {
        Args: {
          p_billing_customer_id: string
          p_billing_interval: string
          p_cancel_at_period_end: boolean
          p_canceled_at: string
          p_current_period_end: string
          p_current_period_start: string
          p_entitlement_metadata: Json
          p_entitlement_status: string
          p_entitlement_valid_until: string
          p_grace_until: string
          p_latest_invoice_id: string
          p_livemode: boolean
          p_plan: string
          p_status: string
          p_stripe_price_id: string
          p_stripe_product_id: string
          p_stripe_subscription_id: string
          p_subscription_metadata?: Json
          p_tier?: string
          p_user_id: string
        }
        Returns: Json
      }
      user_has_active_entitlement: {
        Args: { p_user_id: string }
        Returns: boolean
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["superadmin"],
      order_status_enum: ["draft", "awaiting_payment", "paid", "cancelled"],
    },
  },
} as const
