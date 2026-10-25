import { useEffect, useState } from 'react'
import { supabase, timeZone } from './supabase'

export type UserStats = {
  username: string; display_name: string | null; avatar_url: string | null; joined: string
  submissions: number; scored: number; points: number; agreement: number | null; iou: number | null
  rank: number | null; ranked: number; island_weeks: number
}
export type BoardRow = {
  rank: number; username: string; display_name: string | null; avatar_url: string | null
  points: number; scored: number | null; agreement: number | null; iou: number | null; on_island: boolean
}
export type RankPoint = { week: string; rank: number; points: number }

/** A labeller's public stats, per-day counts and weekly rank history. stats: undefined while loading, null if unknown. */
export function useUserStats(username: string | undefined, reloadKey = 0) {
  const [stats, setStats] = useState<UserStats | null | undefined>(undefined)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [history, setHistory] = useState<RankPoint[]>([])
  useEffect(() => {
    if (!username) return
    let live = true
    supabase.rpc('profile_stats', { p_username: username }).then(({ data }) => live && setStats((data as UserStats[] | null)?.[0] ?? null))
    supabase.rpc('contributions', { p_username: username, p_tz: timeZone }).then(({ data }) => {
      if (live) setCounts(new Map(((data as { day: string; n: number }[] | null) ?? []).map((r) => [r.day, r.n])))
    })
    supabase.rpc('rank_history', { p_username: username }).then(({ data }) => live && setHistory((data as RankPoint[] | null) ?? []))
    return () => {
      live = false
    }
  }, [username, reloadKey])
  return { stats, counts, history }
}

/** The live waitlist (week null) or a weekly snapshot. */
export function useLeaderboard(week: string | null, limit: number) {
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  useEffect(() => {
    let live = true
    setRows(null)
    supabase.rpc('leaderboard', { p_week: week, p_limit: limit }).then(({ data }) => live && setRows((data as BoardRow[] | null) ?? []))
    return () => {
      live = false
    }
  }, [week, limit])
  return rows
}

export const pct = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v * 100)}%`)
export const since = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
