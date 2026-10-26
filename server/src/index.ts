import { createServer } from 'node:http'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { Server } from 'socket.io'
import { GameService } from './game.js'

const app = express()
const httpServer = createServer(app)
const port = process.env.PORT === undefined ? 3001 : Number(process.env.PORT)
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({ origin: allowedOrigins }))
app.get('/health', (_request, response) => response.json({ status: 'ok' }))

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
})
const playerSockets = new Map<string, string>()

const game = new GameService({
  onUpdate: (code, closed) => {
    if (closed) {
      io.to(code).emit('room:closed')
      return
    }
    const state = game.getPublicState(code)
    if (state) io.to(code).emit('room:state', state)
  },
})

type Callback = (response: { ok: boolean; error?: string; message?: string; code?: string; token?: string; playerId?: string }) => void

function respond(callback: unknown, result: { ok: boolean; error?: string; message?: string; code?: string; token?: string; playerId?: string }): void {
  if (typeof callback === 'function') (callback as Callback)(result)
}

io.on('connection', (socket) => {
  let activeToken: string | null = null
  let activeCode: string | null = null
  const currentPlayerId = () => activeCode && activeToken && playerSockets.get(activeToken) === socket.id
    ? game.getPlayerByToken(activeCode, activeToken)
    : null
  const claimPlayer = (token: string, code: string) => {
    activeToken = token
    activeCode = code
    playerSockets.set(token, socket.id)
  }

  socket.on('room:create', (payload: unknown, callback?: unknown) => {
    if (activeToken) {
      respond(callback, { ok: false, error: 'Leave your current room before creating another.' })
      return
    }
    const nickname = typeof payload === 'object' && payload !== null && 'nickname' in payload
      ? (payload as { nickname?: unknown }).nickname
      : null
    if (typeof nickname !== 'string') {
      respond(callback, { ok: false, error: 'Choose a valid nickname.' })
      return
    }
    const result = game.createRoom(nickname)
    if (result.ok) {
      claimPlayer(result.token, result.code)
      socket.join(result.code)
      io.to(result.code).emit('room:state', game.getPublicState(result.code))
    }
    respond(callback, result)
  })

  socket.on('room:join', (payload: unknown, callback?: unknown) => {
    if (activeToken) {
      respond(callback, { ok: false, error: 'Leave your current room before joining another.' })
      return
    }
    const body = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
    if (typeof body.code !== 'string' || typeof body.nickname !== 'string') {
      respond(callback, { ok: false, error: 'Enter a room code and nickname.' })
      return
    }
    const result = game.joinRoom(body.code, body.nickname)
    if (!result.ok) {
      console.warn('[room:join] rejected', { reason: result.reason ?? 'invalid-request' })
    }
    if (result.ok) {
      claimPlayer(result.token, result.code)
      socket.join(result.code)
      io.to(result.code).emit('room:state', game.getPublicState(result.code))
    }
    respond(callback, result)
  })

  socket.on('room:resume', (payload: unknown, callback?: unknown) => {
    if (activeToken) {
      respond(callback, { ok: false, error: 'This connection already belongs to a room.' })
      return
    }
    const token = typeof payload === 'object' && payload !== null && 'token' in payload
      ? (payload as { token?: unknown }).token
      : null
    if (typeof token !== 'string') {
      respond(callback, { ok: false, error: 'Reconnect session is invalid.' })
      return
    }
    const result = game.reconnect(token)
    if (!result) {
      respond(callback, { ok: false, error: 'Your previous room is no longer available.' })
      return
    }
    claimPlayer(token, result.code)
    socket.join(result.code)
    const state = game.getPublicState(result.code)
    if (state) socket.emit('room:state', state)
    respond(callback, { ok: true, ...result, token })
  })

  socket.on('player:ready', (payload: unknown, callback?: unknown) => {
    const ready = typeof payload === 'object' && payload !== null && 'ready' in payload
      ? (payload as { ready?: unknown }).ready
      : null
    const playerId = currentPlayerId()
    const result = !activeCode || !playerId
      ? { ok: false as const, error: 'Join a room first.' }
      : typeof ready !== 'boolean'
        ? { ok: false as const, error: 'Ready status must be a boolean.' }
        : game.setReady(activeCode, playerId, ready)
    respond(callback, result)
  })

  socket.on('game:start', (_payload: unknown, callback?: unknown) => {
    const playerId = currentPlayerId()
    const result = activeCode && playerId
      ? game.startGame(activeCode, playerId)
      : { ok: false as const, error: 'Join a room first.' }
    respond(callback, result)
  })

  socket.on('game:level:set', (payload: unknown, callback?: unknown) => {
    const levelId = typeof payload === 'object' && payload !== null && 'levelId' in payload
      ? (payload as { levelId?: unknown }).levelId
      : null
    const playerId = currentPlayerId()
    const result = activeCode && playerId
      ? game.selectLevel(activeCode, playerId, levelId)
      : { ok: false as const, error: 'Join a room first.' }
    respond(callback, result)
  })

  socket.on('game:input', (payload: unknown, callback?: unknown) => {
    const body = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
    const playerId = currentPlayerId()
    const result = activeCode && playerId
      ? game.setInput(activeCode, playerId, body.dx, body.dy)
      : { ok: false as const, error: 'Join a room first.' }
    respond(callback, result)
  })

  socket.on('game:interact', (_payload: unknown, callback?: unknown) => {
    const playerId = currentPlayerId()
    const result = activeCode && playerId
      ? game.interact(activeCode, playerId)
      : { ok: false as const, error: 'Join a room first.' }
    respond(callback, result)
  })

  socket.on('game:replay', (_payload: unknown, callback?: unknown) => {
    const playerId = currentPlayerId()
    const result = activeCode && playerId
      ? game.replay(activeCode, playerId)
      : { ok: false as const, error: 'Join a room first.' }
    respond(callback, result)
  })

  socket.on('game:next-level', (_payload: unknown, callback?: unknown) => {
    const playerId = currentPlayerId()
    const result = activeCode && playerId
      ? game.continueToNextLevel(activeCode, playerId)
      : { ok: false as const, error: 'Join a room first.' }
    respond(callback, result)
  })

  socket.on('disconnect', () => {
    if (activeToken && playerSockets.get(activeToken) === socket.id) {
      playerSockets.delete(activeToken)
      game.disconnect(activeToken)
    }
  })
})

httpServer.listen(port, () => {
  console.info(`PANIC PROTOCOL server listening on port ${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    game.closeAll()
    httpServer.close(() => process.exit(0))
  })
}
