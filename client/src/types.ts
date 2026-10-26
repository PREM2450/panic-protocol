export type Phase = 'lobby' | 'playing' | 'finished'
export type LevelId = 'power-outage' | 'drone-invasion' | 'final-extraction'

export interface Player {
  id: string
  nickname: string
  connected: boolean
  ready: boolean
  score: number
  x: number
  y: number
  health: number
  lives: number
  downed: boolean
}

export interface Point {
  x: number
  y: number
}

export interface Wall {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface Hazard extends Point {
  id: string
  radius: number
  direction?: 1 | -1
  patrol?: {
    axis: 'x' | 'y'
    min: number
    max: number
    speed: number
  }
}

export interface Arena {
  width: number
  height: number
  levelId: LevelId
  levelNumber: number
  levelName: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  walls: Wall[]
  hazards: Hazard[]
  pickups: Array<Point & { id: string }>
  terminals: Array<Point & { id: string; active: boolean }>
  drones: Array<Point & { id: string }>
  extraction: Point
  missionSeconds: number
  droneSpeed: number
  droneDetectionRadius: number
  extractionSeconds: number
  extractionEndsAt: number | null
}

export interface MissionResult {
  outcome: 'victory' | 'defeat'
  reason: string
  score: number
  levelId: LevelId
  levelNumber: number
  levelName: string
}

export interface RoomState {
  code: string
  phase: Phase
  hostId: string
  players: Player[]
  teamScore: number
  teamEnergy: number
  selectedLevel: LevelId | null
  unlockedLevel: number
  totalLevels: number
  deadline: number | null
  arena: Arena | null
  result: MissionResult | null
}

export interface Ack {
  ok: boolean
  error?: string
  message?: string
  code?: string
  token?: string
  playerId?: string
}
