import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Supabase project credentials
const SUPABASE_URL = "https://skjiauemwcmafsskqdky.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNramlhdWVtd2NtYWZzc2txZGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMTQ0NzMsImV4cCI6MjA4MTU5MDQ3M30.szp4pk3_88mZAndhBh3SdBc0G3usb4GN52wvnrNG5ew";

// Create Supabase client with AsyncStorage for session persistence
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
