import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { supabase, timeZone } from './supabase'

export type Progress = {
  today: number; total: number; combo: number; streak: number; daily_goal: number
  rank: number | null; ranked: number; points: number; audio_version: 'alpha' | 'beta'
}

type ProgressState = { progress: Progress | null; refresh: () => Promise<void>; set: (p: Partial<Progress>) => void }

const Ctx = createContext<ProgressState>({ progress: null, refresh: async () => {}, set: () => {} })

/** The labeller's daily bar, combo, streak and waitlist rank, shared by the top bar and the label page. */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [progress, setProgress] = useState<Progress | null>(null)
  const uid = profile?.id
  const refresh = useCallback(async () => {
    if (!uid) return setProgress(null)
    const { data } = await supabase.rpc('labelling_state', { p_tz: timeZone })
    setProgress((data as Progress[] | null)?.[0] ?? null)
  }, [uid])
  useEffect(() => {
    refresh()
  }, [refresh])
  const set = useCallback((p: Partial<Progress>) => setProgress((old) => (old ? { ...old, ...p } : old)), [])
  return <Ctx.Provider value={{ progress, refresh, set }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProgress = () => useContext(Ctx)
