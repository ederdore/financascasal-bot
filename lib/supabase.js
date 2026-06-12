import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://cpombcvppitlgynqzhsr.supabase.co/rest/v1/'  // ← sua URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwb21iY3ZwcGl0bGd5bnF6aHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MzEwMzYsImV4cCI6MjA5MjMwNzAzNn0.qb7WC2lGELaK5C8Ga09Bhs3tHDL04sW2SeY_SFMoZ1A'              // ← sua chave

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})