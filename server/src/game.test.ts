import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameService } from './game.js'
import { LEVELS } from './levels.js'

const services: GameService[] = []

function createService() {
  const game = new GameService()
  services.push(game)
  return game
}

function createTwoPlayerRoom(game: GameService) {
  const host = game.createRoom('Operator One')
  if (!host.ok) throw new Error(host.error)
  const guest = game.joinRoom(host.code, 'Operator Two')
  if (!guest.ok) throw new Error(guest.error)
  return { host, guest }
}

function startTwoPlayerGame(game: GameService) {
  const players = createTwoPlayerRoom(game)
  const selected = game.selectLevel(players.host.code, players.host.playerId, 'power-outage')
  if (!selected.ok) throw new Error(selected.error)
  const started = game.startGame(players.host.code, players.host.playerId)
  if (!started.ok) throw new Error(started.error)
  return players
}

function moveFor(game: GameService, code: string, playerId: string, dx: number, dy: number, milliseconds: number) {
  expect(game.setInput(code, playerId, dx, dy).ok).toBe(true)
  vi.advanceTimersByTime(milliseconds)
  expect(game.setInput(code, playerId, 0, 0).ok).toBe(true)
}

function walkAxis(game: GameService, code: string, playerId: string, axis: 'x' | 'y', target: number) {
  for (let tick = 0; tick < 100; tick += 1) {
    const player = game.getPublicState(code)?.players.find((entry) => entry.id === playerId)
    if (!player || Math.abs(player[axis] - target) <= 18) return
    const direction = Math.sign(target - player[axis])
    expect(
      game.setInput(code, playerId, axis === 'x' ? direction : 0, axis === 'y' ? direction : 0),
      `movement rejected while walking to ${axis}=${target}: ${JSON.stringify(game.getPublicState(code)?.players.find((entry) => entry.id === playerId))}`,
    ).toMatchObject({ ok: true })
    vi.advanceTimersByTime(100)
  }
  throw new Error(`Could not reach ${axis}=${target}`)
}

function walkTo(game: GameService, code: string, playerId: string, x: number, y: number) {
  walkAxis(game, code, playerId, 'x', x)
  walkAxis(game, code, playerId, 'y', y)
  expect(game.setInput(code, playerId, 0, 0).ok).toBe(true)
}

afterEach(() => {
  for (const game of services.splice(0)) game.closeAll()
  vi.useRealTimers()
})

describe('GameService', () => {
  it('enforces six-player capacity, valid codes, and unique callsigns', () => {
    const game = createService()
    const host = game.createRoom('Operator One')
    if (!host.ok) throw new Error(host.error)
    expect(game.joinRoom('INVALID!', 'Someone')).toMatchObject({ ok: false })
    expect(game.joinRoom(host.code, 'Operator One')).toMatchObject({ ok: false })
    for (let index = 2; index <= 6; index += 1) {
      expect(game.joinRoom(host.code, `Operator ${index}`).ok).toBe(true)
    }
    expect(game.joinRoom(host.code, 'Operator Seven')).toMatchObject({ ok: false, error: expect.stringContaining('six') })
  })

  it('creates fresh joinable rooms after earlier rooms are abandoned', () => {
    const game = createService()
    const codes = new Set<string>()
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const host = game.createRoom(`Host ${cycle}`)
      if (!host.ok) throw new Error(host.error)
      expect(codes.has(host.code)).toBe(false)
      codes.add(host.code)
      const guest = game.joinRoom(host.code, `Guest ${cycle}`)
      expect(guest).toMatchObject({ ok: true, code: host.code })
      if (!guest.ok) throw new Error(guest.error)
      game.disconnect(guest.token)
      game.disconnect(host.token)
      const next = game.createRoom(`Next ${cycle}`)
      if (!next.ok) throw new Error(next.error)
      expect(game.joinRoom(next.code, `Joiner ${cycle}`).ok).toBe(true)
    }
  })

  it('keeps rooms isolated between server instances', () => {
    const creator = createService()
    const joiner = createService()
    const room = creator.createRoom('Operator One')
    if (!room.ok) throw new Error(room.error)
    expect(joiner.joinRoom(room.code, 'Operator Two')).toMatchObject({ ok: false, reason: 'not-found' })
  })

  it('keeps simultaneous rooms independent', () => {
    const game = createService()
    const first = createTwoPlayerRoom(game)
    const second = createTwoPlayerRoom(game)
    expect(first.host.code).not.toBe(second.host.code)
    expect(game.selectLevel(first.host.code, first.host.playerId, 'power-outage').ok).toBe(true)
    expect(game.startGame(first.host.code, first.host.playerId).ok).toBe(true)
    expect(game.getPublicState(first.host.code)).toMatchObject({ phase: 'playing', arena: { levelId: 'power-outage' } })
    expect(game.getPublicState(second.host.code)).toMatchObject({ phase: 'lobby', arena: null, teamEnergy: 0 })
  })

  it('defines three distinct maps with escalating objectives and threats', () => {
    expect(LEVELS.map(({ id, number }) => [id, number])).toEqual([
      ['power-outage', 1],
      ['drone-invasion', 2],
      ['final-extraction', 3],
    ])
    expect(LEVELS.map((level) => level.terminals.length)).toEqual([2, 3, 4])
    expect(LEVELS.map((level) => level.drones.length)).toEqual([0, 3, 4])
    expect(LEVELS.map((level) => level.hazards.length)).toEqual([2, 4, 7])
    expect(LEVELS.every((level) => level.hazards.every((hazard) => hazard.patrol))).toBe(true)
    expect(LEVELS.map((level) => level.missionSeconds)).toEqual([180, 165, 150])
    expect(LEVELS.map((level) => level.extractionSeconds)).toEqual([0, 0, 12])
    expect(LEVELS[1]?.droneDetectionRadius).toBeGreaterThan(0)
    expect(LEVELS[2]?.hazards.filter((hazard) => hazard.patrol).length).toBeGreaterThan(0)
    for (const level of LEVELS) {
      expect(level.pickups.length).toBeGreaterThanOrEqual(level.terminals.length * 2)
      expect(level.walls.length).toBeGreaterThan(0)
    }
  })

  it('allows only the host to start and requires two connected players', () => {
    const game = createService()
    const host = game.createRoom('Operator One')
    if (!host.ok) throw new Error(host.error)
    expect(game.startGame(host.code, host.playerId)).toMatchObject({ ok: false })
    const guest = game.joinRoom(host.code, 'Operator Two')
    if (!guest.ok) throw new Error(guest.error)
    expect(game.startGame(host.code, guest.playerId)).toMatchObject({ ok: false, error: expect.stringContaining('host') })
    expect(game.startGame(host.code, host.playerId)).toMatchObject({ ok: false, error: expect.stringContaining('Select a valid') })
    expect(game.selectLevel(host.code, host.playerId, 'power-outage').ok).toBe(true)
    expect(game.startGame(host.code, host.playerId).ok).toBe(true)
  })

  it('synchronizes host level selection and prevents non-host changes', () => {
    const updates: string[] = []
    const game = new GameService({ onUpdate: (code) => updates.push(code) })
    services.push(game)
    const { host, guest } = createTwoPlayerRoom(game)

    expect(game.getPublicState(host.code)?.selectedLevel).toBeNull()
    expect(game.startGame(host.code, host.playerId)).toMatchObject({ ok: false, error: expect.stringContaining('Select a valid') })
    expect(game.selectLevel(host.code, guest.playerId, 'power-outage')).toMatchObject({ ok: false, error: expect.stringContaining('host') })
    expect(game.selectLevel(host.code, host.playerId, 'not-a-level')).toMatchObject({ ok: false })
    expect(game.selectLevel(host.code, host.playerId, 'final-extraction').ok).toBe(true)
    expect(game.getPublicState(host.code)).toMatchObject({
      selectedLevel: 'final-extraction',
      unlockedLevel: 1,
      players: [{ id: host.playerId }, { id: guest.playerId }],
    })
    expect(game.startGame(host.code, host.playerId).ok).toBe(true)
    expect(game.getPublicState(host.code)).toMatchObject({
      phase: 'playing',
      selectedLevel: 'final-extraction',
      arena: { levelId: 'final-extraction', levelNumber: 3, terminals: [{ id: 'terminal-a' }, { id: 'terminal-b' }, { id: 'terminal-c' }, { id: 'terminal-d' }] },
    })
    expect(updates.filter((code) => code === host.code).length).toBeGreaterThan(2)
  })

  it('starts each level with its own authoritative map, objectives, hazards, and timer', () => {
    const game = createService()
    const rooms = LEVELS.map((level) => ({ level, ...createTwoPlayerRoom(game) }))
    const maps = []
    for (const { level, host } of rooms) {
      expect(game.selectLevel(host.code, host.playerId, level.id).ok).toBe(true)
      expect(game.startGame(host.code, host.playerId).ok).toBe(true)
      maps.push(game.getPublicState(host.code)?.arena)
    }

    expect(maps.map((arena) => arena?.levelId)).toEqual(LEVELS.map((level) => level.id))
    expect(maps.map((arena) => arena?.walls)).not.toEqual([maps[0]?.walls, maps[0]?.walls, maps[0]?.walls])
    expect(maps.map((arena) => arena?.terminals.length)).toEqual([2, 3, 4])
    expect(maps.map((arena) => arena?.drones.length)).toEqual([0, 3, 4])
    expect(maps.map((arena) => arena?.hazards.length)).toEqual([2, 4, 7])
    expect(maps.map((arena) => arena?.missionSeconds)).toEqual([180, 165, 150])
    expect(maps[2]?.extractionSeconds).toBe(12)
  })

  it('runs Drone Invasion pursuit and Final Extraction patrol hazards on the server', () => {
    vi.useFakeTimers()
    const game = createService()
    const droneRoom = createTwoPlayerRoom(game)
    expect(game.selectLevel(droneRoom.host.code, droneRoom.host.playerId, 'drone-invasion').ok).toBe(true)
    expect(game.startGame(droneRoom.host.code, droneRoom.host.playerId).ok).toBe(true)
    const droneBefore = game.getPublicState(droneRoom.host.code)?.arena?.drones.find((drone) => drone.id === 'drone-a')
    vi.advanceTimersByTime(1_000)
    const droneAfter = game.getPublicState(droneRoom.host.code)?.arena?.drones.find((drone) => drone.id === 'drone-a')
    expect(droneAfter?.x).toBeLessThan(droneBefore?.x ?? 0)
    walkTo(game, droneRoom.host.code, droneRoom.host.playerId, 80, 310)
    walkTo(game, droneRoom.host.code, droneRoom.host.playerId, 280, 310)
    vi.advanceTimersByTime(2_000)
    expect(game.getPublicState(droneRoom.host.code)?.players.find((player) => player.id === droneRoom.host.playerId)?.health).toBeLessThan(100)

    const finalRoom = createTwoPlayerRoom(game)
    expect(game.selectLevel(finalRoom.host.code, finalRoom.host.playerId, 'final-extraction').ok).toBe(true)
    expect(game.startGame(finalRoom.host.code, finalRoom.host.playerId).ok).toBe(true)
    const hazardBefore = game.getPublicState(finalRoom.host.code)?.arena?.hazards.find((hazard) => hazard.id === 'surge-b')
    vi.advanceTimersByTime(1_000)
    const hazardAfter = game.getPublicState(finalRoom.host.code)?.arena?.hazards.find((hazard) => hazard.id === 'surge-b')
    expect(hazardAfter?.x).not.toBe(hazardBefore?.x)
  })

  it('moves every configured danger zone on every level', () => {
    vi.useFakeTimers()
    const game = createService()
    const missions = LEVELS.map((level) => {
      const { host } = createTwoPlayerRoom(game)
      expect(game.selectLevel(host.code, host.playerId, level.id).ok).toBe(true)
      expect(game.startGame(host.code, host.playerId).ok).toBe(true)
      return { code: host.code, initialHazards: game.getPublicState(host.code)?.arena?.hazards }
    })

    vi.advanceTimersByTime(1_000)

    for (const mission of missions) {
      const hazards = game.getPublicState(mission.code)?.arena?.hazards
      expect(hazards?.length).toBe(mission.initialHazards?.length)
      expect(hazards?.every((hazard, index) => {
        const initial = mission.initialHazards?.[index]
        return hazard.x !== initial?.x || hazard.y !== initial?.y
      })).toBe(true)
    }
  })

  it('moves players quickly while still preventing movement through walls', () => {
    vi.useFakeTimers()
    const game = createService()
    const { host } = startTwoPlayerGame(game)
    expect(game.setInput(host.code, host.playerId, 2, 0)).toMatchObject({ ok: false })
    expect(game.setInput(host.code, host.playerId, '1', 0)).toMatchObject({ ok: false })
    expect(game.setInput(host.code, host.playerId, 1, 0).ok).toBe(true)
    vi.advanceTimersByTime(2_000)
    const blockedPlayer = game.getPublicState(host.code)?.players.find((entry) => entry.id === host.playerId)
    expect(blockedPlayer?.x).toBeGreaterThan(245)
    expect(blockedPlayer?.x).toBeLessThan(260)
    expect(game.setInput(host.code, host.playerId, 0, 1).ok).toBe(true)
    vi.advanceTimersByTime(1_000)
    const fastPlayer = game.getPublicState(host.code)?.players.find((entry) => entry.id === host.playerId)
    expect(fastPlayer?.y).toBeGreaterThan(300)
  })

  it('applies server-side damage when a player enters a hazard', () => {
    vi.useFakeTimers()
    const game = createService()
    const { host } = startTwoPlayerGame(game)
    walkTo(game, host.code, host.playerId, 190, 90)
    walkTo(game, host.code, host.playerId, 190, 330)
    walkTo(game, host.code, host.playerId, 365, 330)
    walkTo(game, host.code, host.playerId, 365, 260)
    walkTo(game, host.code, host.playerId, 560, 260)
    walkTo(game, host.code, host.playerId, 620, 380)
    expect(game.getPublicState(host.code)?.players.find((player) => player.id === host.playerId)?.health).toBeLessThan(100)
  })

  it('collects energy cells and spends energy to activate terminals for score', () => {
    vi.useFakeTimers()
    const game = createService()
    const { host } = startTwoPlayerGame(game)

    walkTo(game, host.code, host.playerId, 190, 190)
    walkTo(game, host.code, host.playerId, 190, 330)
    walkTo(game, host.code, host.playerId, 365, 330)
    walkTo(game, host.code, host.playerId, 365, 365)

    expect(game.getPublicState(host.code)?.teamEnergy).toBe(2)
    walkTo(game, host.code, host.playerId, 360, 120)
    expect(game.interact(host.code, host.playerId)).toMatchObject({ ok: true, message: 'Terminal activated.' })
    const state = game.getPublicState(host.code)
    expect(state?.teamEnergy).toBe(0)
    expect(state?.teamScore).toBe(350)
    expect(state?.arena?.terminals[0]?.active).toBe(true)
  })

  it('rejects interaction without energy and awards no free score', () => {
    const game = createService()
    const { host } = startTwoPlayerGame(game)
    const result = game.interact(host.code, host.playerId)
    expect(result).toMatchObject({ ok: false })
    expect(game.getPublicState(host.code)?.teamScore).toBe(0)
  })

  it('completes a playable level through pickups, terminals and extraction, then unlocks the next map', () => {
    vi.useFakeTimers()
    const game = createService()
    const { host, guest } = startTwoPlayerGame(game)
    game.disconnect(guest.token)

    walkTo(game, host.code, host.playerId, 190, 90)
    walkTo(game, host.code, host.playerId, 190, 190)
    expect(game.getPublicState(host.code)?.teamEnergy).toBe(1)
    vi.advanceTimersByTime(1_000)
    expect(game.getPublicState(host.code)?.teamEnergy).toBe(1)
    walkTo(game, host.code, host.playerId, 190, 330)
    walkTo(game, host.code, host.playerId, 365, 330)
    walkTo(game, host.code, host.playerId, 365, 365)
    walkTo(game, host.code, host.playerId, 365, 260)
    walkTo(game, host.code, host.playerId, 560, 260)
    walkTo(game, host.code, host.playerId, 560, 150)
    walkTo(game, host.code, host.playerId, 560, 500)
    walkTo(game, host.code, host.playerId, 660, 500)
    expect(game.getPublicState(host.code)?.teamEnergy).toBe(4)

    walkTo(game, host.code, host.playerId, 660, 590)
    walkTo(game, host.code, host.playerId, 360, 590)
    walkTo(game, host.code, host.playerId, 360, 120)
    expect(game.interact(host.code, host.playerId)).toMatchObject({ ok: true, message: 'Terminal activated.' })
    const scoreAfterFirstTerminal = game.getPublicState(host.code)?.teamScore
    expect(game.interact(host.code, host.playerId).ok).toBe(false)
    expect(game.getPublicState(host.code)?.teamScore).toBe(scoreAfterFirstTerminal)

    walkTo(game, host.code, host.playerId, 360, 590)
    walkTo(game, host.code, host.playerId, 850, 590)
    walkTo(game, host.code, host.playerId, 850, 500)
    expect(game.interact(host.code, host.playerId)).toMatchObject({ ok: true, message: 'Terminal activated.' })
    walkTo(game, host.code, host.playerId, 920, 570)
    expect(game.interact(host.code, host.playerId)).toMatchObject({ ok: true, message: 'Extraction confirmed. Mission complete.' })
    expect(game.getPublicState(host.code)).toMatchObject({
      phase: 'finished',
      selectedLevel: 'power-outage',
      unlockedLevel: 2,
      result: { outcome: 'victory', levelId: 'power-outage' },
    })

    expect(game.continueToNextLevel(host.code, host.playerId).ok).toBe(true)
    expect(game.getPublicState(host.code)).toMatchObject({
      phase: 'playing',
      selectedLevel: 'drone-invasion',
      arena: { levelNumber: 2, drones: expect.arrayContaining([expect.objectContaining({ id: 'drone-a' })]) },
    })
    const droneBefore = game.getPublicState(host.code)?.arena?.drones.find((drone) => drone.id === 'drone-a')
    vi.advanceTimersByTime(1_000)
    const droneAfter = game.getPublicState(host.code)?.arena?.drones.find((drone) => drone.id === 'drone-a')
    expect(droneAfter).not.toEqual(droneBefore)
    expect(game.getPublicState(host.code)?.arena?.missionSeconds).toBe(165)
  })

  it('loses when the countdown expires and allows the host to replay', () => {
    vi.useFakeTimers()
    const game = createService()
    const { host } = startTwoPlayerGame(game)
    vi.advanceTimersByTime(180_000)
    expect(game.getPublicState(host.code)).toMatchObject({
      phase: 'finished',
      result: { outcome: 'defeat', reason: expect.stringContaining('timer expired') },
    })
    expect(game.replay(host.code, host.playerId).ok).toBe(true)
    expect(game.getPublicState(host.code)).toMatchObject({
      phase: 'playing',
      selectedLevel: 'power-outage',
      arena: { levelNumber: 1 },
      teamEnergy: 0,
    })
  })

  it('restores an in-progress player after reconnect and reclaims room capacity after lobby disconnect', () => {
    const game = createService()
    const { host, guest } = createTwoPlayerRoom(game)
    game.selectLevel(host.code, host.playerId, 'power-outage')
    game.startGame(host.code, host.playerId)
    game.disconnect(guest.token)
    expect(game.getPublicState(host.code)?.players.find((player) => player.id === guest.playerId)?.connected).toBe(false)
    expect(game.reconnect(guest.token)).toEqual({ code: host.code, playerId: guest.playerId })
    expect(game.getPublicState(host.code)?.players.find((player) => player.id === guest.playerId)?.connected).toBe(true)
  })

  it('reassigns the host when the current host leaves the lobby', () => {
    const game = createService()
    const { host, guest } = createTwoPlayerRoom(game)
    game.disconnect(host.token)
    expect(game.getPublicState(host.code)).toMatchObject({
      phase: 'lobby',
      hostId: guest.playerId,
      players: [{ id: guest.playerId, connected: true }],
    })
  })
})
