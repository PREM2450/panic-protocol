import { randomInt, randomUUID } from 'node:crypto'
import { getLevel, isLevelId, LEVELS, type Hazard, type LevelDefinition, type LevelId, type Point, type Wall } from './levels.js'

export const WORLD_WIDTH = 1000
export const WORLD_HEIGHT = 640
export const MISSION_SECONDS = 180
const PLAYER_MOVE_SPEED = 240

export interface PlayerState {
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

export interface ArenaState {
  width: number
  height: number
  levelId: LevelId
  levelNumber: number
  levelName: string
  difficulty: LevelDefinition['difficulty']
  walls: Wall[]
  hazards: Array<Hazard & { direction?: 1 | -1 }>
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
  phase: 'lobby' | 'playing' | 'finished'
  hostId: string
  players: PlayerState[]
  teamScore: number
  teamEnergy: number
  selectedLevel: LevelId | null
  unlockedLevel: number
  totalLevels: number
  deadline: number | null
  arena: ArenaState | null
  result: MissionResult | null
}

interface Player extends PlayerState {
  token: string
  inputX: number
  inputY: number
  lastDamageAt: number
}

interface GameRoom {
  code: string
  phase: RoomState['phase']
  hostId: string
  players: Player[]
  teamScore: number
  teamEnergy: number
  selectedLevel: LevelId | null
  unlockedLevel: number
  deadline: number | null
  arena: ArenaState | null
  result: MissionResult | null
  tickTimer: ReturnType<typeof setInterval> | null
  cleanupTimer: ReturnType<typeof setTimeout> | null
  lastTickAt: number
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const START_POSITIONS: Point[] = [
  { x: 80, y: 90 }, { x: 145, y: 90 }, { x: 80, y: 155 },
  { x: 145, y: 155 }, { x: 210, y: 90 }, { x: 210, y: 155 },
]

function makeArena(level: LevelDefinition): ArenaState {
  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    levelId: level.id,
    levelNumber: level.number,
    levelName: level.name,
    difficulty: level.difficulty,
    walls: structuredClone(level.walls),
    hazards: level.hazards.map((hazard) => ({ ...hazard, direction: 1 as const })),
    pickups: structuredClone(level.pickups),
    terminals: level.terminals.map((terminal) => ({ ...terminal, active: false })),
    drones: structuredClone(level.drones),
    extraction: { ...level.extraction },
    missionSeconds: level.missionSeconds,
    droneSpeed: level.droneSpeed,
    droneDetectionRadius: level.droneDetectionRadius,
    extractionSeconds: level.extractionSeconds,
    extractionEndsAt: null,
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function intersectsWall(x: number, y: number, wall: Wall, radius = 15): boolean {
  const nearestX = Math.max(wall.x, Math.min(x, wall.x + wall.width))
  const nearestY = Math.max(wall.y, Math.min(y, wall.y + wall.height))
  return distance({ x, y }, { x: nearestX, y: nearestY }) < radius
}

function validNickname(value: string): string | null {
  const nickname = value.trim()
  return nickname.length >= 2 && nickname.length <= 18 ? nickname : null
}

export class GameService {
  private readonly rooms = new Map<string, GameRoom>()
  private readonly tokenToCode = new Map<string, string>()
  private readonly onUpdate?: (code: string, closed?: boolean) => void

  constructor(options: { onUpdate?: (code: string, closed?: boolean) => void } = {}) {
    this.onUpdate = options.onUpdate
  }

  createRoom(rawNickname: string) {
    const nickname = validNickname(rawNickname)
    if (!nickname) return { ok: false as const, error: 'Callsigns must contain 2–18 characters.' }
    let code = ''
    for (let attempt = 0; attempt < 20; attempt += 1) {
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
      if (!this.rooms.has(code)) break
      code = ''
    }
    if (!code) return { ok: false as const, error: 'Could not allocate a room code. Try again.' }
    const token = randomUUID()
    const player = this.newPlayer(nickname, token, 0)
    const room: GameRoom = {
      code,
      phase: 'lobby',
      hostId: player.id,
      players: [player],
      teamScore: 0,
      teamEnergy: 0,
      selectedLevel: null,
      unlockedLevel: 1,
      deadline: null,
      arena: null,
      result: null,
      tickTimer: null,
      cleanupTimer: null,
      lastTickAt: Date.now(),
    }
    this.rooms.set(code, room)
    this.tokenToCode.set(token, code)
    this.notify(room)
    return { ok: true as const, code, token, playerId: player.id }
  }

  joinRoom(rawCode: string, rawNickname: string) {
    const code = rawCode.trim().toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
      return { ok: false as const, reason: 'invalid-code', error: 'Enter a valid five-character room code.' }
    }
    const room = this.rooms.get(code)
    if (!room) return { ok: false as const, reason: 'not-found', error: 'Room unavailable. Check the code or create a new room.' }
    if (room.phase !== 'lobby') {
      return { ok: false as const, reason: 'not-lobby', error: 'This mission has already started.' }
    }
    if (room.players.length >= 6) return { ok: false as const, reason: 'full', error: 'This room already has six operators.' }
    const nickname = validNickname(rawNickname)
    if (!nickname) return { ok: false as const, error: 'Callsigns must contain 2–18 characters.' }
    if (room.players.some((player) => player.nickname.toLowerCase() === nickname.toLowerCase())) {
      return { ok: false as const, error: 'That callsign is already in this room.' }
    }
    const token = randomUUID()
    const player = this.newPlayer(nickname, token, room.players.length)
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer)
      room.cleanupTimer = null
    }
    room.players.push(player)
    if (!room.hostId) room.hostId = player.id
    this.tokenToCode.set(token, code)
    this.notify(room)
    return { ok: true as const, code, token, playerId: player.id }
  }

  getPlayerByToken(code: string, token: string): string | null {
    const room = this.rooms.get(code)
    return room?.players.find((player) => player.token === token && player.connected)?.id ?? null
  }

  reconnect(token: string): { code: string; playerId: string } | null {
    const code = this.tokenToCode.get(token)
    const room = code ? this.rooms.get(code) : undefined
    const player = room?.players.find((entry) => entry.token === token)
    if (!code || !room || !player || player.connected) return null
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer)
      room.cleanupTimer = null
    }
    player.connected = true
    this.notify(room)
    return { code, playerId: player.id }
  }

  setReady(code: string, playerId: string, ready: boolean) {
    const room = this.rooms.get(code)
    const player = room?.players.find((entry) => entry.id === playerId && entry.connected)
    if (!room || room.phase !== 'lobby' || !player) return { ok: false as const, error: 'This lobby is no longer available.' }
    player.ready = ready
    this.notify(room)
    return { ok: true as const }
  }

  selectLevel(code: string, playerId: string, levelId: unknown) {
    const room = this.rooms.get(code)
    if (!room || room.phase !== 'lobby') return { ok: false as const, error: 'Levels can only be selected in the lobby.' }
    if (room.hostId !== playerId) return { ok: false as const, error: 'Only the host can select the mission level.' }
    if (!room.players.some((player) => player.id === playerId && player.connected)) {
      return { ok: false as const, error: 'The host must be connected to select a level.' }
    }
    if (!isLevelId(levelId)) return { ok: false as const, error: 'Choose a valid level.' }
    const level = getLevel(levelId)
    room.selectedLevel = level.id
    this.notify(room)
    return { ok: true as const }
  }

  startGame(code: string, playerId: string) {
    const room = this.rooms.get(code)
    if (!room || room.phase !== 'lobby') return { ok: false as const, error: 'This lobby is no longer available.' }
    if (room.hostId !== playerId) return { ok: false as const, error: 'Only the host can deploy the mission.' }
    if (!room.players.some((player) => player.id === playerId && player.connected)) {
      return { ok: false as const, error: 'The host must be connected to deploy the mission.' }
    }
    if (room.players.filter((player) => player.connected).length < 2) {
      return { ok: false as const, error: 'At least two connected operators are required.' }
    }
    if (!isLevelId(room.selectedLevel)) {
      return { ok: false as const, error: 'Select a valid mission level before deployment.' }
    }
    this.beginMission(room, room.selectedLevel)
    return { ok: true as const }
  }

  setInput(code: string, playerId: string, dx: unknown, dy: unknown) {
    const room = this.rooms.get(code)
    const player = room?.players.find((entry) => entry.id === playerId && entry.connected)
    if (!room || room.phase !== 'playing' || !player || player.downed) {
      return { ok: false as const, error: 'Movement is unavailable right now.' }
    }
    if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx as number) > 1 || Math.abs(dy as number) > 1) {
      return { ok: false as const, error: 'Movement input must be a direction.' }
    }
    player.inputX = dx as number
    player.inputY = dy as number
    return { ok: true as const }
  }

  interact(code: string, playerId: string) {
    const room = this.rooms.get(code)
    const player = room?.players.find((entry) => entry.id === playerId && entry.connected)
    const arena = room?.arena
    if (!room || room.phase !== 'playing' || !player || !arena || player.downed) {
      return { ok: false as const, error: 'Interaction is unavailable right now.' }
    }

    const downed = room.players.find((other) => other.downed && other.lives > 0 && distance(player, other) <= 48)
    if (downed) {
      downed.downed = false
      downed.health = 50
      downed.x = player.x + 28
      downed.y = player.y
      room.teamScore += 100
      player.score += 100
      this.notify(room)
      return { ok: true as const, message: `${downed.nickname} recovered.` }
    }

    const terminal = arena.terminals.find((entry) => !entry.active && distance(player, entry) <= 48)
    if (terminal) {
      if (room.teamEnergy < 2) return { ok: false as const, error: 'Collect two energy cells to activate this terminal.' }
      room.teamEnergy -= 2
      terminal.active = true
      room.teamScore += 250
      player.score += 250
      this.notify(room)
      return { ok: true as const, message: 'Terminal activated.' }
    }
    if (arena.terminals.some((entry) => !entry.active)) {
      return { ok: false as const, error: 'Move closer to an inactive terminal or a downed teammate.' }
    }
    if (distance(player, arena.extraction) <= 52) {
      const notExtracted = room.players.some((teammate) => teammate.connected && (!teammate.downed || teammate.lives > 0) && distance(teammate, arena.extraction) > 52)
      if (notExtracted) return { ok: false as const, error: 'Every connected operator must reach extraction.' }
      if (arena.extractionSeconds > 0) {
        if (arena.extractionEndsAt !== null) return { ok: false as const, error: 'Extraction sequence is already in progress.' }
        arena.extractionEndsAt = Date.now() + arena.extractionSeconds * 1000
        this.notify(room)
        return { ok: true as const, message: `Final extraction sequence started. Hold the zone for ${arena.extractionSeconds} seconds.` }
      }
      this.finish(room, 'victory', `${getLevel(arena.levelId).name} complete. The team extracted safely.`)
      return { ok: true as const, message: 'Extraction confirmed. Mission complete.' }
    }
    return { ok: false as const, error: 'Move closer to the extraction point, terminal, or teammate.' }
  }

  replay(code: string, playerId: string) {
    const room = this.rooms.get(code)
    if (!room || room.phase !== 'finished') return { ok: false as const, error: 'This mission is not ready to replay.' }
    if (!isLevelId(room.selectedLevel)) return { ok: false as const, error: 'Select a mission level before replaying.' }
    if (room.hostId !== playerId) return { ok: false as const, error: 'Only the host can launch another mission.' }
    if (!room.players.some((player) => player.id === playerId && player.connected)) {
      return { ok: false as const, error: 'The host must be connected to replay.' }
    }
    for (const player of room.players) {
      player.score = 0
      player.health = 100
      player.lives = 3
      player.downed = false
      player.ready = false
      player.inputX = 0
      player.inputY = 0
    }
    room.teamScore = 0
    room.teamEnergy = 0
    this.beginMission(room, room.selectedLevel)
    return { ok: true as const }
  }

  continueToNextLevel(code: string, playerId: string) {
    const room = this.rooms.get(code)
    if (!room || room.phase !== 'finished' || room.result?.outcome !== 'victory') {
      return { ok: false as const, error: 'Complete the current level before proceeding.' }
    }
    if (room.hostId !== playerId) return { ok: false as const, error: 'Only the host can continue the mission.' }
    if (!room.players.some((player) => player.id === playerId && player.connected)) {
      return { ok: false as const, error: 'The host must be connected to continue.' }
    }
    const completedLevel = room.result?.levelId
    if (!isLevelId(completedLevel)) return { ok: false as const, error: 'Mission result is unavailable.' }
    const nextLevel = LEVELS.find((level) => level.number === getLevel(completedLevel).number + 1)
    if (!nextLevel || nextLevel.number > room.unlockedLevel) {
      return { ok: false as const, error: 'There is no unlocked level after this one.' }
    }
    this.beginMission(room, nextLevel.id)
    return { ok: true as const }
  }

  levelCatalog() {
    return LEVELS.map(({ id, number, name, description, difficulty }) => ({
      id, number, name, description, difficulty,
    }))
  }

  disconnect(token: string): void {
    const code = this.tokenToCode.get(token)
    const room = code ? this.rooms.get(code) : undefined
    const player = room?.players.find((entry) => entry.token === token)
    if (!room || !player) return
    player.connected = false
    player.inputX = 0
    player.inputY = 0
    if (room.phase === 'lobby') {
      room.players = room.players.filter((entry) => entry.id !== player.id)
      this.tokenToCode.delete(token)
    }
    if (room.hostId === player.id) room.hostId = room.players.find((entry) => entry.connected)?.id ?? ''
    if (room.players.every((entry) => !entry.connected)) this.scheduleCleanup(room)
    this.notify(room)
  }

  getPublicState(code: string): RoomState | null {
    const room = this.rooms.get(code)
    if (!room) return null
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: room.players.map(({ token: _token, inputX: _inputX, inputY: _inputY, lastDamageAt: _lastDamageAt, ...player }) => ({ ...player })),
      teamScore: room.teamScore,
      teamEnergy: room.teamEnergy,
      selectedLevel: room.selectedLevel,
      unlockedLevel: room.unlockedLevel,
      totalLevels: LEVELS.length,
      deadline: room.deadline,
      arena: room.arena ? structuredClone(room.arena) : null,
      result: room.result ? { ...room.result } : null,
    }
  }

  closeAll(): void {
    for (const room of this.rooms.values()) this.disposeRoom(room)
    this.rooms.clear()
    this.tokenToCode.clear()
  }

  private newPlayer(nickname: string, token: string, index: number): Player {
    const position = START_POSITIONS[index] ?? START_POSITIONS[0]!
    return {
      id: randomUUID(),
      token,
      nickname,
      connected: true,
      ready: false,
      score: 0,
      x: position.x,
      y: position.y,
      health: 100,
      lives: 3,
      downed: false,
      inputX: 0,
      inputY: 0,
      lastDamageAt: 0,
    }
  }

  private beginMission(room: GameRoom, levelId: LevelId): void {
    if (room.tickTimer) clearInterval(room.tickTimer)
    room.phase = 'playing'
    room.selectedLevel = levelId
    room.teamEnergy = 0
    const level = getLevel(levelId)
    room.deadline = Date.now() + level.missionSeconds * 1000
    room.result = null
    room.arena = makeArena(level)
    room.players.forEach((player, index) => {
      const point = START_POSITIONS[index] ?? START_POSITIONS[0]!
      player.x = point.x
      player.y = point.y
      player.health = 100
      player.lives = 3
      player.downed = false
      player.inputX = 0
      player.inputY = 0
      player.lastDamageAt = 0
    })
    room.lastTickAt = Date.now()
    room.tickTimer = setInterval(() => this.tick(room), 100)
    room.tickTimer.unref?.()
    this.notify(room)
  }

  private tick(room: GameRoom): void {
    if (room.phase !== 'playing' || !room.arena || !room.deadline) return
    const now = Date.now()
    const elapsed = Math.min(0.2, Math.max(0, (now - room.lastTickAt) / 1000))
    room.lastTickAt = now
    if (now >= room.deadline) {
      this.finish(room, 'defeat', 'The city lockdown timer expired before extraction.')
      return
    }

    const arena = room.arena
    for (const hazard of arena.hazards) {
      const patrol = hazard.patrol
      if (!patrol) continue
      const position = patrol.axis === 'x' ? hazard.x : hazard.y
      const next = position + (patrol.speed * elapsed * (hazard.direction ?? 1))
      const bounded = Math.max(patrol.min, Math.min(patrol.max, next))
      if (patrol.axis === 'x') hazard.x = bounded
      else hazard.y = bounded
      if (bounded === patrol.min || bounded === patrol.max) hazard.direction = (hazard.direction ?? 1) === 1 ? -1 : 1
    }

    const activePlayers = room.players.filter((player) => player.connected && !player.downed)
    for (const player of activePlayers) {
      const length = Math.hypot(player.inputX, player.inputY) || 1
      const nextX = player.x + (player.inputX / length) * PLAYER_MOVE_SPEED * elapsed
      const nextY = player.y + (player.inputY / length) * PLAYER_MOVE_SPEED * elapsed
      const clampedX = Math.max(16, Math.min(arena.width - 16, nextX))
      const clampedY = Math.max(16, Math.min(arena.height - 16, nextY))
      if (!arena.walls.some((wall) => intersectsWall(clampedX, player.y, wall))) player.x = clampedX
      if (!arena.walls.some((wall) => intersectsWall(player.x, clampedY, wall))) player.y = clampedY
      const pickup = arena.pickups.find((cell) => distance(player, cell) < 25)
      if (pickup) {
        arena.pickups = arena.pickups.filter((cell) => cell.id !== pickup.id)
        room.teamEnergy += 1
        room.teamScore += 50
        player.score += 50
      }
      const onHazard = arena.hazards.some((hazard) => distance(player, hazard) < hazard.radius + 12)
      const drone = arena.drones.find((enemy) => distance(player, enemy) < 25)
      if ((onHazard || drone) && now - player.lastDamageAt >= 900) {
        player.lastDamageAt = now
        player.health = Math.max(0, player.health - (drone ? 25 : 15))
        if (player.health === 0) {
          player.lives = Math.max(0, player.lives - 1)
          player.downed = true
          player.inputX = 0
          player.inputY = 0
        }
      }
    }

    for (const drone of arena.drones) {
      const target = activePlayers.reduce<Player | null>((closest, player) => {
        if (!closest || distance(player, drone) < distance(closest, drone)) return player
        return closest
      }, null)
      if (!target || distance(target, drone) > arena.droneDetectionRadius) continue
      const deltaX = target.x - drone.x
      const deltaY = target.y - drone.y
      const length = Math.hypot(deltaX, deltaY) || 1
      const nextX = drone.x + (deltaX / length) * arena.droneSpeed * elapsed
      const nextY = drone.y + (deltaY / length) * arena.droneSpeed * elapsed
      if (!arena.walls.some((wall) => intersectsWall(nextX, nextY, wall, 12))) {
        drone.x = nextX
        drone.y = nextY
      }
    }

    if (arena.extractionEndsAt !== null) {
      const allOperatorsPresent = room.players.every((player) =>
        !player.connected || (player.downed && player.lives === 0) || distance(player, arena.extraction) <= 52,
      )
      if (!allOperatorsPresent) {
        arena.extractionEndsAt = null
      } else if (now >= arena.extractionEndsAt) {
        this.finish(room, 'victory', `${getLevel(arena.levelId).name} complete. The team held the extraction zone.`)
        return
      }
    }

    if (!room.players.some((player) => player.connected && !player.downed)) {
      this.finish(room, 'defeat', 'Every operator is down. The city network is lost.')
      return
    }
    this.notify(room)
  }

  private finish(room: GameRoom, outcome: MissionResult['outcome'], reason: string): void {
    if (room.phase !== 'playing') return
    room.phase = 'finished'
    const levelId = room.arena?.levelId ?? room.selectedLevel
    if (!isLevelId(levelId)) throw new Error('A playing room must have a selected level.')
    const level = getLevel(levelId)
    if (outcome === 'victory') room.unlockedLevel = Math.min(LEVELS.length, Math.max(room.unlockedLevel, level.number + 1))
    room.result = {
      outcome,
      reason,
      score: room.teamScore,
      levelId: level.id,
      levelNumber: level.number,
      levelName: level.name,
    }
    room.players.forEach((player) => {
      player.inputX = 0
      player.inputY = 0
    })
    if (room.tickTimer) clearInterval(room.tickTimer)
    room.tickTimer = null
    this.notify(room)
  }

  private scheduleCleanup(room: GameRoom): void {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer)
    room.cleanupTimer = setTimeout(() => {
      if (room.players.every((player) => !player.connected)) {
        this.disposeRoom(room)
        this.rooms.delete(room.code)
        this.onUpdate?.(room.code, true)
      }
    }, 120_000)
    room.cleanupTimer.unref?.()
  }

  private disposeRoom(room: GameRoom): void {
    if (room.tickTimer) clearInterval(room.tickTimer)
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer)
    for (const player of room.players) this.tokenToCode.delete(player.token)
  }

  private notify(room: GameRoom): void {
    this.onUpdate?.(room.code)
  }
}
