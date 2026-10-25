import { randomBytes, randomUUID } from 'node:crypto'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const TOTAL_ROUNDS = 6
export const DEFAULT_ROUND_SECONDS = 45

export type Phase = 'lobby' | 'playing' | 'result' | 'finished'

export interface Player {
  id: string
  token: string
  nickname: string
  connected: boolean
  ready: boolean
  score: number
}

export interface Scenario {
  title: string
  sector: string
  severity: 'ELEVATED' | 'CRITICAL' | 'SEVERE'
  brief: string
  intel: string
  choices: { id: string; label: string; detail: string }[]
  correctChoice: string
}

export interface RoundResult {
  correctChoice: string
  votes: Record<string, number>
  correctVotes: number
  pointsAwarded: number
  timedOut: boolean
}

export interface PublicPlayer {
  id: string
  nickname: string
  connected: boolean
  ready: boolean
  score: number
  submitted: boolean
}

export interface PublicRoom {
  code: string
  phase: Phase
  hostId: string
  players: PublicPlayer[]
  teamScore: number
  round: number
  totalRounds: number
  deadline: number | null
  roundSeconds: number
  scenario: Omit<Scenario, 'correctChoice'> | null
  result: RoundResult | null
}

interface GameRoom {
  code: string
  phase: Phase
  hostId: string
  players: Player[]
  teamScore: number
  round: number
  deadline: number | null
  scenario: Scenario | null
  submissions: Map<string, string>
  result: RoundResult | null
  timer: ReturnType<typeof setTimeout> | null
  cleanupTimer: ReturnType<typeof setTimeout> | null
}

export type ActionResult =
  | { ok: true; code: string; token: string; playerId: string }
  | { ok: false; error: string }

const SCENARIOS: Scenario[] = [
  {
    title: 'BLACKOUT AT MERIDIAN',
    sector: 'POWER GRID / DISTRICT 04',
    severity: 'CRITICAL',
    brief: 'A cascading failure has knocked out power to three city blocks. The hospital backup grid has 11 minutes of reserve.',
    intel: 'Grid telemetry shows a transformer overload. Hospital load is isolated on feeder C. A neighboring district can share 18% capacity.',
    choices: [
      { id: 'isolate', label: 'ISOLATE FEEDER C', detail: 'Cut the faulted line. Hospital switches to reserve power.' },
      { id: 'share', label: 'REROUTE CAPACITY', detail: 'Borrow 18% from the neighboring district to stabilize the grid.' },
      { id: 'restart', label: 'FORCE A RESTART', detail: 'Attempt a remote reboot of the overloaded transformer.' },
    ],
    correctChoice: 'isolate',
  },
  {
    title: 'UNKNOWN SIGNAL',
    sector: 'COMMS / UPLINK 7',
    severity: 'ELEVATED',
    brief: 'An unverified signal is broadcasting an evacuation order across public channels. Source attribution is still in progress.',
    intel: 'The message signature is invalid, but the channel remains live. Emergency dispatch can take over the frequency in 90 seconds.',
    choices: [
      { id: 'broadcast', label: 'ISSUE A COUNTER-ALERT', detail: 'Tell every channel the message is false before attribution is complete.' },
      { id: 'takeover', label: 'SECURE THE FREQUENCY', detail: 'Move dispatch onto a verified emergency channel and preserve the signal.' },
      { id: 'shutdown', label: 'SILENCE ALL CHANNELS', detail: 'Disable the public network until the source is confirmed.' },
    ],
    correctChoice: 'takeover',
  },
  {
    title: 'HARBOR WALL BREACH',
    sector: 'COASTAL DEFENSE / EAST',
    severity: 'SEVERE',
    brief: 'A storm surge is overtopping the east harbor wall. The low-lying transit tunnel is still open to traffic.',
    intel: 'Water sensors show a 1.4m rise in six minutes. A floodgate can divert pressure from the tunnel to an unoccupied basin.',
    choices: [
      { id: 'divert', label: 'OPEN DIVERSION GATE', detail: 'Route water into the empty basin and close the tunnel.' },
      { id: 'reinforce', label: 'REINFORCE THE WALL', detail: 'Deploy barriers at the breach and keep the tunnel open.' },
      { id: 'pump', label: 'ACTIVATE DEWATERING', detail: 'Start tunnel pumps while crews assess the wall.' },
    ],
    correctChoice: 'divert',
  },
  {
    title: 'AIR QUALITY EVENT',
    sector: 'PUBLIC HEALTH / ZONE 12',
    severity: 'CRITICAL',
    brief: 'Air quality monitors detect an unknown contaminant near a crowded market. Wind is carrying the plume east.',
    intel: 'The contaminant is not identified. The east-side transit station has filtered ventilation; open streets do not.',
    choices: [
      { id: 'shelter', label: 'SHELTER IN PLACE', detail: 'Close market buildings and direct people away from open streets.' },
      { id: 'evacuate', label: 'EVACUATE EAST', detail: 'Move the crowd east with the wind toward the transit station.' },
      { id: 'vent', label: 'MAXIMIZE VENTILATION', detail: 'Open building systems to dilute the contaminant.' },
    ],
    correctChoice: 'shelter',
  },
  {
    title: 'TRANSIT CONTROL FAILURE',
    sector: 'MASS TRANSIT / CENTRAL',
    severity: 'SEVERE',
    brief: 'Two trains have lost central signaling near a junction. A third train is approaching the same section.',
    intel: 'The trains retain independent braking. Trackside crews can establish manual block separation if traffic is halted.',
    choices: [
      { id: 'halt', label: 'HALT NETWORK TRAFFIC', detail: 'Stop all trains and establish manual separation before movement resumes.' },
      { id: 'reroute', label: 'REROUTE THE THIRD TRAIN', detail: 'Send the approaching train through the adjacent junction.' },
      { id: 'restore', label: 'REBOOT CENTRAL CONTROL', detail: 'Attempt to restore signaling while trains hold position.' },
    ],
    correctChoice: 'halt',
  },
  {
    title: 'WATER SYSTEM CONTAMINATION',
    sector: 'UTILITIES / RESERVOIR NORTH',
    severity: 'CRITICAL',
    brief: 'A sensor anomaly suggests a contaminant has entered the north water supply. Confirmation will take several minutes.',
    intel: 'The reservoir feeds two districts. The south supply can cover essential services if cross-connections are isolated.',
    choices: [
      { id: 'isolate', label: 'ISOLATE NORTH SUPPLY', detail: 'Close the cross-connections and issue a precautionary water advisory.' },
      { id: 'flush', label: 'FLUSH THE MAIN', detail: 'Increase flow to clear the suspected contaminant from the network.' },
      { id: 'wait', label: 'WAIT FOR CONFIRMATION', detail: 'Keep the system unchanged until lab results arrive.' },
    ],
    correctChoice: 'isolate',
  },
]

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export class GameService {
  private readonly rooms = new Map<string, GameRoom>()
  private readonly roundSeconds: number
  private readonly onUpdate: (code: string, closed?: boolean) => void

  constructor(options: { roundSeconds?: number; onUpdate?: (code: string, closed?: boolean) => void } = {}) {
    this.roundSeconds = options.roundSeconds ?? DEFAULT_ROUND_SECONDS
    this.onUpdate = options.onUpdate ?? (() => undefined)
  }

  createRoom(nickname: string): ActionResult {
    const safeNickname = this.validateNickname(nickname)
    if (!safeNickname) return { ok: false, error: 'Choose a nickname between 2 and 18 characters.' }

    let code = ''
    for (let attempt = 0; attempt < 20; attempt += 1) {
      code = Array.from(randomBytes(5), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
      if (!this.rooms.has(code)) break
      code = ''
    }
    if (!code) return { ok: false, error: 'Could not create a room. Please try again.' }

    const player: Player = {
      id: randomUUID(),
      token: randomUUID(),
      nickname: safeNickname,
      connected: true,
      ready: true,
      score: 0,
    }
    const room: GameRoom = {
      code,
      phase: 'lobby',
      hostId: player.id,
      players: [player],
      teamScore: 0,
      round: 0,
      deadline: null,
      scenario: null,
      submissions: new Map(),
      result: null,
      timer: null,
      cleanupTimer: null,
    }
    this.rooms.set(code, room)
    this.changed(code)
    return { ok: true, code, token: player.token, playerId: player.id }
  }

  joinRoom(rawCode: string, nickname: string): ActionResult {
    const code = this.validateCode(rawCode)
    const safeNickname = this.validateNickname(nickname)
    if (!code) return { ok: false, error: 'Enter a valid 5-character room code.' }
    if (!safeNickname) return { ok: false, error: 'Choose a nickname between 2 and 18 characters.' }

    const room = this.rooms.get(code)
    if (!room || room.phase !== 'lobby') return { ok: false, error: 'That room is unavailable. Check the code or create a new room.' }
    if (room.players.length >= MAX_PLAYERS) {
      return { ok: false, error: 'That room is full (maximum 6 operators).' }
    }
    if (room.players.some((player) => player.connected && player.nickname.toLowerCase() === safeNickname.toLowerCase())) {
      return { ok: false, error: 'That nickname is already in use in this room.' }
    }

    const player: Player = {
      id: randomUUID(),
      token: randomUUID(),
      nickname: safeNickname,
      connected: true,
      ready: false,
      score: 0,
    }
    if (!room.players.some((candidate) => candidate.connected)) room.hostId = player.id
    room.players.push(player)
    this.clearCleanup(room)
    this.changed(code)
    return { ok: true, code, token: player.token, playerId: player.id }
  }

  reconnect(token: string): { code: string; playerId: string } | null {
    if (typeof token !== 'string' || token.length > 64) return null
    for (const room of this.rooms.values()) {
      const player = room.players.find((candidate) => candidate.token === token)
      if (!player) continue
      player.connected = true
      this.clearCleanup(room)
      this.changed(room.code)
      return { code: room.code, playerId: player.id }
    }
    return null
  }

  disconnect(token: string): void {
    for (const room of this.rooms.values()) {
      const playerIndex = room.players.findIndex((candidate) => candidate.token === token)
      if (playerIndex < 0) continue
      const player = room.players[playerIndex]!
      player.connected = false
      if (room.phase === 'lobby') room.players.splice(playerIndex, 1)
      if (room.hostId === player.id) {
        const nextHost = room.players.find((candidate) => candidate.connected)
        if (nextHost) room.hostId = nextHost.id
      }
      if (room.players.every((candidate) => !candidate.connected)) {
        room.cleanupTimer = setTimeout(() => this.closeRoom(room.code), 120_000)
        room.cleanupTimer.unref?.()
      }
      this.changed(room.code)
      return
    }
  }

  setReady(code: string, playerId: string, ready: boolean): ActionResult {
    const room = this.rooms.get(code)
    const player = room?.players.find((candidate) => candidate.id === playerId && candidate.connected)
    if (!room || room.phase !== 'lobby' || !player || typeof ready !== 'boolean') {
      return { ok: false, error: 'Ready status cannot be changed right now.' }
    }
    player.ready = ready
    this.changed(code)
    return { ok: true, code, token: player.token, playerId: player.id }
  }

  startGame(code: string, playerId: string): ActionResult {
    const room = this.rooms.get(code)
    if (!room || room.phase !== 'lobby') return { ok: false, error: 'This room is not waiting to start.' }
    if (room.hostId !== playerId) return { ok: false, error: 'Only the host can start the mission.' }
    const host = room.players.find((player) => player.id === playerId && player.connected)
    if (!host) return { ok: false, error: 'The host is not connected.' }
    if (room.players.filter((player) => player.connected).length < MIN_PLAYERS) {
      return { ok: false, error: 'At least 2 connected operators are required to start.' }
    }
    this.beginRound(room, 1)
    this.changed(code)
    return { ok: true, code, token: host.token, playerId }
  }

  submitChoice(code: string, playerId: string, choiceId: string): ActionResult {
    const room = this.rooms.get(code)
    const player = room?.players.find((candidate) => candidate.id === playerId && candidate.connected)
    if (!room || room.phase !== 'playing' || !room.scenario || !player) {
      return { ok: false, error: 'There is no active decision to submit.' }
    }
    if (!room.scenario.choices.some((choice) => choice.id === choiceId)) {
      return { ok: false, error: 'That response is not available for this scenario.' }
    }
    if (room.submissions.has(playerId)) return { ok: false, error: 'Your response is already locked in.' }
    room.submissions.set(playerId, choiceId)
    if (room.submissions.size >= room.players.filter((candidate) => candidate.connected).length) {
      this.resolveRound(room, false)
    }
    this.changed(code)
    return { ok: true, code, token: player.token, playerId }
  }

  replay(code: string, playerId: string): ActionResult {
    const room = this.rooms.get(code)
    const player = room?.players.find((candidate) => candidate.id === playerId && candidate.connected)
    if (!room || room.phase !== 'finished' || !player || room.hostId !== playerId) {
      return { ok: false, error: 'Only the host can launch a replay after the mission.' }
    }
    for (const member of room.players) member.score = 0
    room.teamScore = 0
    room.round = 0
    room.result = null
    this.beginRound(room, 1)
    this.changed(code)
    return { ok: true, code, token: player.token, playerId }
  }

  getPublicState(code: string): PublicRoom | null {
    const room = this.rooms.get(code)
    if (!room) return null
    const scenario = room.scenario
      ? Object.fromEntries(Object.entries(room.scenario).filter(([key]) => key !== 'correctChoice')) as Omit<Scenario, 'correctChoice'>
      : null
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: room.players.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        connected: player.connected,
        ready: player.ready,
        score: player.score,
        submitted: room.submissions.has(player.id),
      })),
      teamScore: room.teamScore,
      round: room.round,
      totalRounds: TOTAL_ROUNDS,
      deadline: room.deadline,
      roundSeconds: this.roundSeconds,
      scenario,
      result: room.result,
    }
  }

  getPlayerByToken(code: string, token: string): string | null {
    const room = this.rooms.get(code)
    return room?.players.find((player) => player.token === token && player.connected)?.id ?? null
  }

  closeAll(): void {
    for (const room of this.rooms.values()) {
      this.clearTimers(room)
      this.onUpdate(room.code, true)
    }
    this.rooms.clear()
  }

  private beginRound(room: GameRoom, round: number): void {
    room.round = round
    room.phase = 'playing'
    room.scenario = SCENARIOS[round - 1] ?? null
    room.submissions.clear()
    room.result = null
    room.deadline = Date.now() + this.roundSeconds * 1000
    if (room.timer) clearTimeout(room.timer)
    room.timer = setTimeout(() => {
      if (room.phase === 'playing') {
        this.resolveRound(room, true)
        this.changed(room.code)
      }
    }, this.roundSeconds * 1000)
    room.timer.unref?.()
  }

  private resolveRound(room: GameRoom, timedOut: boolean): void {
    if (room.phase !== 'playing' || !room.scenario) return
    if (room.timer) clearTimeout(room.timer)
    room.timer = null
    const votes: Record<string, number> = {}
    for (const choice of room.scenario.choices) votes[choice.id] = 0
    let correctVotes = 0
    for (const [playerId, choiceId] of room.submissions) {
      votes[choiceId] = (votes[choiceId] ?? 0) + 1
      if (choiceId === room.scenario.correctChoice) {
        correctVotes += 1
        const player = room.players.find((candidate) => candidate.id === playerId)
        if (player) player.score += 100
      }
    }
    const connectedCount = room.players.filter((player) => player.connected).length
    const pointsAwarded = correctVotes * 100 + (correctVotes >= Math.ceil(connectedCount / 2) ? 200 : 0)
    room.teamScore += pointsAwarded
    room.result = {
      correctChoice: room.scenario.correctChoice,
      votes,
      correctVotes,
      pointsAwarded,
      timedOut,
    }
    if (room.round >= TOTAL_ROUNDS) {
      room.phase = 'finished'
      room.deadline = null
    } else {
      room.phase = 'result'
      room.deadline = Date.now() + 6_000
      room.timer = setTimeout(() => {
        if (room.phase === 'result') {
          this.beginRound(room, room.round + 1)
          this.changed(room.code)
        }
      }, 6_000)
      room.timer.unref?.()
    }
  }

  private validateNickname(value: string): string | null {
    if (typeof value !== 'string') return null
    const nickname = value.trim().replace(/\s+/g, ' ')
    return nickname.length >= 2 && nickname.length <= 18 && /^[\p{L}\p{N} _-]+$/u.test(nickname)
      ? nickname
      : null
  }

  private validateCode(value: string): string | null {
    if (typeof value !== 'string') return null
    const code = value.trim().toUpperCase()
    return /^[A-HJ-NP-Z2-9]{5}$/.test(code) ? code : null
  }

  private changed(code: string): void {
    this.onUpdate(code)
  }

  private clearCleanup(room: GameRoom): void {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer)
    room.cleanupTimer = null
  }

  private clearTimers(room: GameRoom): void {
    if (room.timer) clearTimeout(room.timer)
    this.clearCleanup(room)
  }

  private closeRoom(code: string): void {
    const room = this.rooms.get(code)
    if (!room) return
    this.clearTimers(room)
    this.rooms.delete(code)
    this.onUpdate(code, true)
  }
}
