'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Root(){
  const router=useRouter()
  useEffect(()=>{
    if(!supabase){router.replace('/research');return}
    supabase.auth.getSession().then(({data})=>{
      router.replace(data.session?'/home':'/research')
    })
  },[])
  return null
}
