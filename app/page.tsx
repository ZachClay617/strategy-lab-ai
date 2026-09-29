'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// proxy.ts already redirects '/' to '/home' or '/login' based on session
// before this component ever runs, in the normal (Supabase configured) case.
// This client-side fallback only ever actually fires when Supabase env vars
// are missing entirely, which proxy.ts deliberately skips redirecting on.
export default function Root(){
  const router=useRouter()
  useEffect(()=>{
    if(!supabase){router.replace('/login');return}
    supabase.auth.getSession().then(({data})=>{
      router.replace(data.session?'/home':'/login')
    })
  },[])
  return null
}
