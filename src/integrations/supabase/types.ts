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
  public: {
    Tables: {
      assembly_consumptions: {
        Row: {
          assembly_order_id: string
          component_item_id: string
          created_at: string
          id: string
          quantity_used: number
          tenant_id: string
          unit_cost: number
        }
        Insert: {
          assembly_order_id: string
          component_item_id: string
          created_at?: string
          id?: string
          quantity_used: number
          tenant_id: string
          unit_cost?: number
        }
        Update: {
          assembly_order_id?: string
          component_item_id?: string
          created_at?: string
          id?: string
          quantity_used?: number
          tenant_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "assembly_consumptions_assembly_order_id_fkey"
            columns: ["assembly_order_id"]
            isOneToOne: false
            referencedRelation: "assembly_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_consumptions_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_consumptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_orders: {
        Row: {
          assembly_item_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_number: string | null
          quantity: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assembly_item_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          quantity: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assembly_item_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          quantity?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_orders_assembly_item_id_fkey"
            columns: ["assembly_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          summary: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          summary?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          summary?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string | null
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank_name: string | null
          branch: string | null
          coa_account_id: string | null
          created_at: string
          currency: string
          current_balance: number
          description: string | null
          iban: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          opening_balance: number
          routing_number: string | null
          swift_code: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["bank_account_type"]
          bank_name?: string | null
          branch?: string | null
          coa_account_id?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          description?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          opening_balance?: number
          routing_number?: string | null
          swift_code?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["bank_account_type"]
          bank_name?: string | null
          branch?: string | null
          coa_account_id?: string | null
          created_at?: string
          currency?: string
          current_balance?: number
          description?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          opening_balance?: number
          routing_number?: string | null
          swift_code?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_coa_account_id_fkey"
            columns: ["coa_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          bank_account_id: string
          branch: string | null
          created_at: string
          created_by: string | null
          deposit: number
          description: string | null
          from_account_id: string | null
          id: string
          reference: string | null
          source_id: string | null
          source_type: string | null
          status: string
          tenant_id: string
          txn_date: string
          txn_type: string
          updated_at: string
          withdrawal: number
        }
        Insert: {
          bank_account_id: string
          branch?: string | null
          created_at?: string
          created_by?: string | null
          deposit?: number
          description?: string | null
          from_account_id?: string | null
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tenant_id: string
          txn_date?: string
          txn_type?: string
          updated_at?: string
          withdrawal?: number
        }
        Update: {
          bank_account_id?: string
          branch?: string | null
          created_at?: string
          created_by?: string | null
          deposit?: number
          description?: string | null
          from_account_id?: string | null
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tenant_id?: string
          txn_date?: string
          txn_type?: string
          updated_at?: string
          withdrawal?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          account_id: string | null
          bill_id: string
          description: string | null
          id: string
          item_id: string | null
          line_total: number
          position: number
          quantity: number
          rate: number
          tax_rate: number
        }
        Insert: {
          account_id?: string | null
          bill_id: string
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          rate?: number
          tax_rate?: number
        }
        Update: {
          account_id?: string | null
          bill_id?: string
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          rate?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_payments: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          notes: string | null
          payment_date: string
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          payment_date?: string
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          payment_date?: string
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount_paid: number
          balance_due: number
          bill_date: string
          bill_number: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          source_po_id: string | null
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          supplier_id: string | null
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          bill_date?: string
          bill_number: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          source_po_id?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          source_po_id?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_source_po_id_fkey"
            columns: ["source_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_subtype: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          parent_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_subtype?: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_subtype?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      composite_explosions: {
        Row: {
          component_item_id: string
          created_at: string
          doc_id: string
          doc_type: string
          id: string
          parent_item_id: string
          quantity: number
          tenant_id: string
        }
        Insert: {
          component_item_id: string
          created_at?: string
          doc_id: string
          doc_type: string
          id?: string
          parent_item_id: string
          quantity: number
          tenant_id: string
        }
        Update: {
          component_item_id?: string
          created_at?: string
          doc_id?: string
          doc_type?: string
          id?: string
          parent_item_id?: string
          quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composite_explosions_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composite_explosions_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composite_explosions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      composite_item_components: {
        Row: {
          component_item_id: string
          composite_item_id: string
          created_at: string
          id: string
          quantity: number
          tenant_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          component_item_id: string
          composite_item_id: string
          created_at?: string
          id?: string
          quantity: number
          tenant_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          component_item_id?: string
          composite_item_id?: string
          created_at?: string
          id?: string
          quantity?: number
          tenant_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "composite_item_components_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composite_item_components_composite_item_id_fkey"
            columns: ["composite_item_id"]
            isOneToOne: false
            referencedRelation: "composite_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composite_item_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      composite_items: {
        Row: {
          composite_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          parent_item_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          composite_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          parent_item_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          composite_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          parent_item_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "composite_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composite_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_applications: {
        Row: {
          amount: number
          applied_on: string
          created_at: string
          created_by: string | null
          credit_id: string
          id: string
          invoice_id: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          applied_on?: string
          created_at?: string
          created_by?: string | null
          credit_id: string
          id?: string
          invoice_id: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          applied_on?: string
          created_at?: string
          created_by?: string | null
          credit_id?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_applications_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "customer_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_applications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_buttons: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          entity: string
          icon: string | null
          id: string
          is_active: boolean
          label: string
          placement: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string
          entity: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          placement?: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          entity?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          placement?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_buttons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string
          data_type: string
          default_value: string | null
          entity: string
          field_key: string
          id: string
          is_active: boolean
          label: string
          options: Json
          position: number
          required: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_type: string
          default_value?: string | null
          entity: string
          field_key: string
          id?: string
          is_active?: boolean
          label: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_type?: string
          default_value?: string | null
          entity?: string
          field_key?: string
          id?: string
          is_active?: boolean
          label?: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          amount: number
          balance: number
          created_at: string
          created_by: string | null
          credit_number: string | null
          currency: string
          customer_id: string
          deleted_at: string | null
          id: string
          issue_date: string
          memo: string | null
          reference: string | null
          source: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          balance: number
          created_at?: string
          created_by?: string | null
          credit_number?: string | null
          currency?: string
          customer_id: string
          deleted_at?: string | null
          id?: string
          issue_date?: string
          memo?: string | null
          reference?: string | null
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          credit_number?: string | null
          currency?: string
          customer_id?: string
          deleted_at?: string | null
          id?: string
          issue_date?: string
          memo?: string | null
          reference?: string | null
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: string | null
          code: string | null
          company_name: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          shipping_address: string | null
          tenant_id: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          billing_address?: string | null
          code?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          shipping_address?: string | null
          tenant_id: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          billing_address?: string | null
          code?: string | null
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          shipping_address?: string | null
          tenant_id?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_approvals: {
        Row: {
          acted_at: string | null
          approval_level: number
          approver_id: string | null
          comments: string | null
          created_at: string
          expense_id: string
          id: string
          status: string
        }
        Insert: {
          acted_at?: string | null
          approval_level?: number
          approver_id?: string | null
          comments?: string | null
          created_at?: string
          expense_id: string
          id?: string
          status?: string
        }
        Update: {
          acted_at?: string | null
          approval_level?: number
          approver_id?: string | null
          comments?: string | null
          created_at?: string
          expense_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_approvals_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          expense_account_id: string | null
          id: string
          is_active: boolean
          name: string
          parent_category_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expense_account_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_category_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expense_account_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_category_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_items: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          customer_id: string | null
          description: string | null
          expense_id: string
          id: string
          position: number
          quantity: number
          rate: number
          tax_amount: number
          tax_rate: number
        }
        Insert: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          customer_id?: string | null
          description?: string | null
          expense_id: string
          id?: string
          position?: number
          quantity?: number
          rate?: number
          tax_amount?: number
          tax_rate?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          customer_id?: string | null
          description?: string | null
          expense_id?: string
          id?: string
          position?: number
          quantity?: number
          rate?: number
          tax_amount?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_receipts: {
        Row: {
          expense_id: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          expense_id: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          expense_id?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          created_at: string
          currency: string
          customer_id: string | null
          employee_user_id: string | null
          exchange_rate: number
          expense_account_id: string | null
          expense_date: string
          expense_number: string
          id: string
          is_billable: boolean
          journal_entry_id: string | null
          notes: string | null
          paid_at: string | null
          payment_account_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          submitted_by_user_id: string | null
          subtotal: number
          tax_amount: number
          tenant_id: string
          total_amount: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          employee_user_id?: string | null
          exchange_rate?: number
          expense_account_id?: string | null
          expense_date?: string
          expense_number: string
          id?: string
          is_billable?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_account_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_by_user_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          employee_user_id?: string | null
          exchange_rate?: number
          expense_account_id?: string | null
          expense_date?: string
          expense_number?: string
          id?: string
          is_billable?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_account_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_by_user_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustment_lines: {
        Row: {
          adjustment_id: string
          id: string
          item_id: string
          qty_after: number
          qty_before: number
          variance: number | null
        }
        Insert: {
          adjustment_id: string
          id?: string
          item_id: string
          qty_after?: number
          qty_before?: number
          variance?: number | null
        }
        Update: {
          adjustment_id?: string
          id?: string
          item_id?: string
          qty_after?: number
          qty_before?: number
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustment_lines_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "inventory_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustment_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string | null
          adjustment_type: Database["public"]["Enums"]["adjustment_type"]
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          adjustment_date?: string
          adjustment_number?: string | null
          adjustment_type: Database["public"]["Enums"]["adjustment_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string | null
          adjustment_type?: Database["public"]["Enums"]["adjustment_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          description: string | null
          id: string
          invoice_id: string
          item_id: string | null
          line_total: number
          position: number
          quantity: number
          rate: number
          tax_rate: number
        }
        Insert: {
          description?: string | null
          id?: string
          invoice_id: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          rate?: number
          tax_rate?: number
        }
        Update: {
          description?: string | null
          id?: string
          invoice_id?: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          rate?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: string | null
          notes: string | null
          payment_date: string
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          method?: string | null
          notes?: string | null
          payment_date?: string
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: string | null
          notes?: string | null
          payment_date?: string
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          source_quote_id: string | null
          source_sales_order_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          source_quote_id?: string | null
          source_sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          source_quote_id?: string | null
          source_sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_source_sales_order_id_fkey"
            columns: ["source_sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          archived_at: string | null
          barcode: string | null
          category: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          hs_code: string | null
          id: string
          image_url: string | null
          inventory_account_id: string | null
          is_active: boolean
          item_type: Database["public"]["Enums"]["item_type"]
          name: string
          preferred_vendor_id: string | null
          purchase_account_id: string | null
          purchase_tax_rate_id: string | null
          reorder_level: number | null
          sales_account_id: string | null
          sales_tax_rate_id: string | null
          selling_price: number | null
          sku: string | null
          stock_on_hand: number
          tenant_id: string
          unit: string | null
          updated_at: string
          valuation_method: string | null
        }
        Insert: {
          archived_at?: string | null
          barcode?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          hs_code?: string | null
          id?: string
          image_url?: string | null
          inventory_account_id?: string | null
          is_active?: boolean
          item_type?: Database["public"]["Enums"]["item_type"]
          name: string
          preferred_vendor_id?: string | null
          purchase_account_id?: string | null
          purchase_tax_rate_id?: string | null
          reorder_level?: number | null
          sales_account_id?: string | null
          sales_tax_rate_id?: string | null
          selling_price?: number | null
          sku?: string | null
          stock_on_hand?: number
          tenant_id: string
          unit?: string | null
          updated_at?: string
          valuation_method?: string | null
        }
        Update: {
          archived_at?: string | null
          barcode?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          hs_code?: string | null
          id?: string
          image_url?: string | null
          inventory_account_id?: string | null
          is_active?: boolean
          item_type?: Database["public"]["Enums"]["item_type"]
          name?: string
          preferred_vendor_id?: string | null
          purchase_account_id?: string | null
          purchase_tax_rate_id?: string | null
          reorder_level?: number | null
          sales_account_id?: string | null
          sales_tax_rate_id?: string | null
          selling_price?: number | null
          sku?: string | null
          stock_on_hand?: number
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          valuation_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_purchase_account_id_fkey"
            columns: ["purchase_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_purchase_tax_rate_id_fkey"
            columns: ["purchase_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_sales_account_id_fkey"
            columns: ["sales_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_sales_tax_rate_id_fkey"
            columns: ["sales_tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          entry_number: string
          id: string
          reference: string | null
          source_id: string | null
          source_type: string | null
          tenant_id: string
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_number: string
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          tenant_id: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_number?: string
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          tenant_id?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          position: number
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          position?: number
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          attention: string | null
          branch: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          name: string
          phone: string | null
          state: string | null
          street1: string | null
          street2: string | null
          tenant_id: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          attention?: string | null
          branch?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name: string
          phone?: string | null
          state?: string | null
          street1?: string | null
          street2?: string | null
          tenant_id: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          attention?: string | null
          branch?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name?: string
          phone?: string | null
          state?: string | null
          street1?: string | null
          street2?: string | null
          tenant_id?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      numbering_series: {
        Row: {
          doc_type: string
          id: string
          next_number: number
          padding: number
          prefix: string
          tenant_id: string
        }
        Insert: {
          doc_type: string
          id?: string
          next_number?: number
          padding?: number
          prefix?: string
          tenant_id: string
        }
        Update: {
          doc_type?: string
          id?: string
          next_number?: number
          padding?: number
          prefix?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "numbering_series_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_tenant_id: string | null
          email: string | null
          full_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_tenant_id?: string | null
          email?: string | null
          full_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_tenant_id?: string | null
          email?: string | null
          full_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_tenant_id_fkey"
            columns: ["current_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          description: string | null
          id: string
          item_id: string | null
          line_total: number
          po_id: string
          position: number
          quantity: number
          rate: number
          tax_rate: number
        }
        Insert: {
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          po_id: string
          position?: number
          quantity?: number
          rate?: number
          tax_rate?: number
        }
        Update: {
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          po_id?: string
          position?: number
          quantity?: number
          rate?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_date: string | null
          id: string
          notes: string | null
          po_date: string
          po_number: string
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string | null
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          po_date?: string
          po_number: string
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          po_date?: string
          po_number?: string
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          description: string | null
          id: string
          item_id: string | null
          line_total: number
          position: number
          quantity: number
          quote_id: string
          rate: number
          tax_rate: number
        }
        Insert: {
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          quote_id: string
          rate?: number
          tax_rate?: number
        }
        Update: {
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          quote_id?: string
          rate?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          quote_date: string
          quote_number: string
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          quote_date?: string
          quote_number: string
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          quote_date?: string
          quote_number?: string
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      record_locks: {
        Row: {
          condition: Json
          created_at: string
          entity: string
          id: string
          is_active: boolean
          lock_fields: Json
          name: string
          roles_allowed: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          condition?: Json
          created_at?: string
          entity: string
          id?: string
          is_active?: boolean
          lock_fields?: Json
          name: string
          roles_allowed?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          condition?: Json
          created_at?: string
          entity?: string
          id?: string
          is_active?: boolean
          lock_fields?: Json
          name?: string
          roles_allowed?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_locks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      related_lists: {
        Row: {
          columns: Json
          created_at: string
          entity: string
          filter: Json
          id: string
          is_active: boolean
          label: string
          position: number
          related_entity: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          entity: string
          filter?: Json
          id?: string
          is_active?: boolean
          label: string
          position?: number
          related_entity: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          entity?: string
          filter?: Json
          id?: string
          is_active?: boolean
          label?: string
          position?: number
          related_entity?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "related_lists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          description: string | null
          id: string
          item_id: string | null
          line_total: number
          position: number
          quantity: number
          rate: number
          sales_order_id: string
          tax_rate: number
        }
        Insert: {
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          rate?: number
          sales_order_id: string
          tax_rate?: number
        }
        Update: {
          description?: string | null
          id?: string
          item_id?: string | null
          line_total?: number
          position?: number
          quantity?: number
          rate?: number
          sales_order_id?: string
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          expected_shipment_date: string | null
          id: string
          notes: string | null
          so_date: string
          so_number: string
          source_quote_id: string | null
          status: Database["public"]["Enums"]["sales_order_status"]
          subtotal: number
          tax_total: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          expected_shipment_date?: string | null
          id?: string
          notes?: string | null
          so_date?: string
          so_number: string
          source_quote_id?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_total?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          expected_shipment_date?: string | null
          id?: string
          notes?: string | null
          so_date?: string
          so_number?: string
          source_quote_id?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_total?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_users: number
          name: string
          price_monthly: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_users?: number
          name: string
          price_monthly?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_users?: number
          name?: string
          price_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      supplier_credits: {
        Row: {
          amount: number
          balance: number
          created_at: string
          created_by: string | null
          credit_number: string | null
          currency: string
          deleted_at: string | null
          id: string
          issue_date: string
          memo: string | null
          reference: string | null
          source: string
          status: string
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          balance: number
          created_at?: string
          created_by?: string | null
          credit_number?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          issue_date?: string
          memo?: string | null
          reference?: string | null
          source?: string
          status?: string
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          credit_number?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          issue_date?: string
          memo?: string | null
          reference?: string | null
          source?: string
          status?: string
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credits_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          code: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          tenant_id: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          rate: number
          tax_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          rate?: number
          tax_type?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          rate?: number
          tax_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string
          id: string
          namespace: string
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          namespace: string
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          namespace?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          base_currency: string
          created_at: string
          email: string | null
          fiscal_year_start: number
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          plan_id: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          base_currency?: string
          created_at?: string
          email?: string | null
          fiscal_year_start?: number
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          plan_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          base_currency?: string
          created_at?: string
          email?: string | null
          fiscal_year_start?: number
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_rules: {
        Row: {
          created_at: string
          entity: string
          error_message: string
          field_key: string
          id: string
          is_active: boolean
          name: string
          operator: string
          tenant_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          entity: string
          error_message: string
          field_key: string
          id?: string
          is_active?: boolean
          name: string
          operator: string
          tenant_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          entity?: string
          error_message?: string
          field_key?: string
          id?: string
          is_active?: boolean
          name?: string
          operator?: string
          tenant_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "validation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_rules: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          is_system: boolean
          name: string
          tax_rate_id: string | null
          tenant_id: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          name: string
          tax_rate_id?: string | null
          tenant_id: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          name?: string
          tax_rate_id?: string | null
          tenant_id?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_rules_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_composite_explosion: {
        Args: {
          _doc_id: string
          _doc_type: string
          _lines: Json
          _tenant: string
        }
        Returns: undefined
      }
      approve_expense: { Args: { _id: string }; Returns: string }
      clear_composite_explosion: {
        Args: { _doc_id: string; _doc_type: string; _tenant: string }
        Returns: undefined
      }
      complete_assembly_order: { Args: { _id: string }; Returns: undefined }
      current_tenant: { Args: never; Returns: string }
      delete_item: { Args: { _id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant: string
          _user: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant: string; _user: string }
        Returns: boolean
      }
      mark_expense_paid: { Args: { _id: string }; Returns: undefined }
      next_doc_number: {
        Args: { _doc_type: string; _tenant: string }
        Returns: string
      }
      provision_tenant: {
        Args: { _currency?: string; _name: string; _slug: string }
        Returns: string
      }
      reconcile_bank_account_balance: {
        Args: { _account: string }
        Returns: number
      }
      reject_expense: {
        Args: { _comment: string; _id: string }
        Returns: undefined
      }
      switch_tenant: { Args: { _tenant: string }; Returns: undefined }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      adjustment_type: "increase" | "decrease" | "recount"
      app_role:
        | "super_admin"
        | "company_admin"
        | "accountant"
        | "sales"
        | "purchasing"
        | "inventory"
        | "readonly"
      bank_account_type: "cash" | "bank" | "credit_card" | "payment_clearing"
      bill_status:
        | "draft"
        | "open"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
      expense_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "paid"
        | "cancelled"
      invoice_status:
        | "draft"
        | "sent"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
      item_type:
        | "inventory"
        | "service"
        | "non_inventory"
        | "composite"
        | "assembly"
      po_status:
        | "draft"
        | "approved"
        | "sent"
        | "partially_received"
        | "received"
        | "closed"
        | "cancelled"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "converted"
      sales_order_status:
        | "draft"
        | "confirmed"
        | "sent"
        | "partially_invoiced"
        | "invoiced"
        | "closed"
        | "cancelled"
      tenant_status: "trial" | "active" | "suspended"
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
      account_type: ["asset", "liability", "equity", "income", "expense"],
      adjustment_type: ["increase", "decrease", "recount"],
      app_role: [
        "super_admin",
        "company_admin",
        "accountant",
        "sales",
        "purchasing",
        "inventory",
        "readonly",
      ],
      bank_account_type: ["cash", "bank", "credit_card", "payment_clearing"],
      bill_status: [
        "draft",
        "open",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
      ],
      expense_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "paid",
        "cancelled",
      ],
      invoice_status: [
        "draft",
        "sent",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
      ],
      item_type: [
        "inventory",
        "service",
        "non_inventory",
        "composite",
        "assembly",
      ],
      po_status: [
        "draft",
        "approved",
        "sent",
        "partially_received",
        "received",
        "closed",
        "cancelled",
      ],
      quote_status: ["draft", "sent", "accepted", "rejected", "converted"],
      sales_order_status: [
        "draft",
        "confirmed",
        "sent",
        "partially_invoiced",
        "invoiced",
        "closed",
        "cancelled",
      ],
      tenant_status: ["trial", "active", "suspended"],
    },
  },
} as const
