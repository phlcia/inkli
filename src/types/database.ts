/**
 * Database types for Supabase tables.
 * user_private_data: private contact info (email, phone); RLS owner-only.
 */

export interface UserPrivateData {
  user_id: string;
  email: string;
  phone_number: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export type UserPrivateDataInsert = Omit<
  UserPrivateData,
  'created_at' | 'updated_at'
>;

export type UserPrivateDataUpdate = Partial<
  Omit<UserPrivateData, 'user_id' | 'created_at'>
>;

export interface Database {
  public: {
    Tables: {
      user_private_data: {
        Row: UserPrivateData;
        Insert: UserPrivateDataInsert;
        Update: UserPrivateDataUpdate;
      };
    };
  };
}
