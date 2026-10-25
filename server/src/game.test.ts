import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameService } from './game.js'

function setup(roundSeconds = 45) {
  const game = new GameService({ roundSeconds })
  const host = game.createRoom('Operator One')
  if (!host.ok) throw new Error(host.error)
  return { game, host }
}

function addSecondPlayer(game: GameService, code: string) {
  const result = game.joinRoom(code, 'Operator Two')
  if (!result.ok) throw new Error(result.error)
  return result
}

afterEach(() => {
  vi.useRealTimers()
})

describe('GameService', () => {
  it('enforces capacity and validates room codes', () => {
    const { game, host } = setup()
    expect(game.joinRoom('INVALID!', 'Someone')).toMatchObject({ ok: false })
    for (let index = 2; index <= 6; index += 1) {
      expect(game.joinRoom(host.code, `Operator ${index}`).ok).toBe(true)
    }
    expect(game.joinRoom(host.code, 'Operator Seven')).toMatchObject({ ok: false, error: expect.stringContaining('full') })
  })

  it('reclaims lobby capacity after a player disconnects', () => {
    const { game, host } = setup()
    const guests = []
    for (let index = 2; index <= 6; index += 1) {
      const guest = game.joinRoom(host.code, `Operator ${index}`)
      if (!guest.ok) throw new Error(guest.error)
      guests.push(guest)
    }
    game.disconnect(guests[0]!.token)
    expect(game.joinRoom(host.code, 'Replacement')).toMatchObject({ ok: true })
    expect(game.getPublicState(host.code)?.players).toHaveLength(6)
  })

  it('assigns a host when a new operator revives an empty lobby', () => {
    const { game, host } = setup()
    const guest = addSecondPlayer(game, host.code)
    game.disconnect(host.token)
    game.disconnect(guest.token)
    const replacement = game.joinRoom(host.code, 'Replacement')
    if (!replacement.ok) throw new Error(replacement.error)
    addSecondPlayer(game, host.code)
    expect(game.getPublicState(host.code)?.hostId).toBe(replacement.playerId)
    expect(game.startGame(host.code, replacement.playerId).ok).toBe(true)
  })

  it('allows only the host to start and requires two players', () => {
    const { game, host } = setup()
    expect(game.startGame(host.code, host.playerId)).toMatchObject({ ok: false })
    const guest = addSecondPlayer(game, host.code)
    expect(game.startGame(host.code, guest.playerId)).toMatchObject({ ok: false, error: expect.stringContaining('host') })
    expect(game.startGame(host.code, host.playerId).ok).toBe(true)
  })

  it('restores an in-progress player session after reconnect', () => {
    const { game, host } = setup()
    const guest = addSecondPlayer(game, host.code)
    game.startGame(host.code, host.playerId)
    game.disconnect(guest.token)
    expect(game.getPublicState(host.code)?.players.find((player) => player.id === guest.playerId)?.connected).toBe(false)
    expect(game.reconnect(guest.token)).toEqual({ code: host.code, playerId: guest.playerId })
    expect(game.getPublicState(host.code)?.players.find((player) => player.id === guest.playerId)?.connected).toBe(true)
  })

  it('transfers lobby leadership when the host disconnects', () => {
    const { game, host } = setup()
    const guest = addSecondPlayer(game, host.code)
    game.disconnect(host.token)
    expect(game.getPublicState(host.code)?.hostId).toBe(guest.playerId)
    expect(game.joinRoom(host.code, 'Operator Three').ok).toBe(true)
    expect(game.startGame(host.code, guest.playerId).ok).toBe(true)
  })

  it('rejects duplicate submissions and awards correct team score', () => {
    const { game, host } = setup()
    const guest = addSecondPlayer(game, host.code)
    game.startGame(host.code, host.playerId)
    expect(game.submitChoice(host.code, host.playerId, 'isolate').ok).toBe(true)
    expect(game.submitChoice(host.code, host.playerId, 'isolate')).toMatchObject({ ok: false })
    expect(game.submitChoice(host.code, guest.playerId, 'share').ok).toBe(true)
    const state = game.getPublicState(host.code)
    expect(state?.phase).toBe('result')
    expect(state?.result).toMatchObject({ correctVotes: 1, pointsAwarded: 300, correctChoice: 'isolate' })
    expect(state?.players.find((player) => player.id === host.playerId)?.score).toBe(100)
    expect(state?.teamScore).toBe(300)
  })

  it('resolves a round on timer expiry and advances the round', () => {
    vi.useFakeTimers()
    const { game, host } = setup(2)
    addSecondPlayer(game, host.code)
    game.startGame(host.code, host.playerId)
    vi.advanceTimersByTime(2_000)
    expect(game.getPublicState(host.code)?.phase).toBe('result')
    expect(game.getPublicState(host.code)?.result?.timedOut).toBe(true)
    vi.advanceTimersByTime(6_000)
    expect(game.getPublicState(host.code)).toMatchObject({ phase: 'playing', round: 2 })
  })

  it('finishes after six rounds and permits host replay', () => {
    vi.useFakeTimers()
    const { game, host } = setup(1)
    addSecondPlayer(game, host.code)
    game.startGame(host.code, host.playerId)
    for (let round = 1; round <= 6; round += 1) {
      vi.advanceTimersByTime(1_000)
      if (round < 6) vi.advanceTimersByTime(6_000)
    }
    expect(game.getPublicState(host.code)?.phase).toBe('finished')
    expect(game.replay(host.code, host.playerId).ok).toBe(true)
    expect(game.getPublicState(host.code)).toMatchObject({ phase: 'playing', round: 1 })
  })
})
