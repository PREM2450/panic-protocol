export type Phase = 'lobby' | 'playing' | 'result' | 'finished'

export interface Player {
  id: string
  nickname: string
  connected: boolean
  ready: boolean
  score: number
  submitted: boolean
}

export interface Scenario {
  title: string
  sector: string
  severity: 'ELEVATED' | 'CRITICAL' | 'SEVERE'
  brief: string
  intel: string
  choices: { id: string; label: string; detail: string }[]
}

export interface RoundResult {
  correctChoice: string
  votes: Record<string, number>
  correctVotes: number
  pointsAwarded: number
  timedOut: boolean
}

export interface RoomState {
  code: string
  phase: Phase
  hostId: string
  players: Player[]
  teamScore: number
  round: number
  totalRounds: number
  deadline: number | null
  roundSeconds: number
  scenario: Scenario | null
  result: RoundResult | null
}

export interface Ack {
  ok: boolean
  error?: string
  code?: string
  token?: string
  playerId?: string
}
