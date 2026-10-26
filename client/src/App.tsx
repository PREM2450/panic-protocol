import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Crosshair,
  Heart,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Siren,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import type { Ack, LevelId, Player, RoomState } from './types'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin)
const TOKEN_KEY = 'panic-protocol-session'

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState<RoomState | null>(null)
  const [playerId, setPlayerId] = useState('')
  const [screen, setScreen] = useState<'home' | 'room'>('home')
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const client = io(SERVER_URL, { transports: ['websocket', 'polling'] })
    setSocket(client)
    client.on('connect', () => {
      setConnected(true)
      const token = localStorage.getItem(TOKEN_KEY)
      if (token) {
        client.emit('room:resume', { token }, (result: Ack) => {
          if (result.ok && result.playerId) {
            setPlayerId(result.playerId)
            setScreen('room')
            setError('')
          } else {
            localStorage.removeItem(TOKEN_KEY)
          }
        })
      }
    })
    client.on('disconnect', () => setConnected(false))
    client.on('room:state', (state: RoomState) => {
      setRoom(state)
      setScreen('room')
    })
    client.on('room:closed', () => {
      localStorage.removeItem(TOKEN_KEY)
      setRoom(null)
      setPlayerId('')
      setScreen('home')
      setError('This room has closed because all operators disconnected.')
    })
    return () => {
      client.disconnect()
      setSocket(null)
    }
  }, [])

  useEffect(() => {
    if (!room?.deadline) {
      setSecondsLeft(0)
      return
    }
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((room.deadline! - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [room?.deadline])

  const me = useMemo(() => room?.players.find((player) => player.id === playerId) ?? null, [room, playerId])
  const isHost = Boolean(room && room.hostId === playerId)
  const submit = useCallback((event: string, payload: object = {}) => {
    if (!socket?.connected) {
      setError('Connection lost. Reconnecting to command center…')
      return
    }
    setLoading(true)
    setError('')
    socket.emit(event, payload, (result: Ack) => {
      setLoading(false)
      if (!result.ok) setError(result.error || 'The action could not be completed.')
      if (result.ok && result.token) localStorage.setItem(TOKEN_KEY, result.token)
      if (result.ok && result.playerId) setPlayerId(result.playerId)
    })
  }, [socket])

  const joinOrCreate = (event: 'room:create' | 'room:join') => {
    if (!socket?.connected) {
      setError('Connecting to command center. Try again in a moment.')
      return
    }
    setLoading(true)
    setError('')
    socket.emit(event, event === 'room:create' ? { nickname } : { nickname, code: roomCode }, (result: Ack) => {
      setLoading(false)
      if (!result.ok) {
        setError(result.error || 'Unable to enter the room.')
        return
      }
      if (result.token) localStorage.setItem(TOKEN_KEY, result.token)
      if (result.playerId) setPlayerId(result.playerId)
      setScreen('room')
    })
  }

  const copyCode = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setError('Could not copy room code. Select the code to copy it manually.')
    }
  }

  const leaveRoom = () => {
    socket?.disconnect()
    localStorage.removeItem(TOKEN_KEY)
    setRoom(null)
    setPlayerId('')
    setScreen('home')
    setError('')
    const client = io(SERVER_URL, { transports: ['websocket', 'polling'] })
    client.on('connect', () => setConnected(true))
    client.on('disconnect', () => setConnected(false))
    client.on('room:state', (state: RoomState) => {
      setRoom(state)
      setScreen('room')
    })
    client.on('room:closed', () => setRoom(null))
    setSocket(client)
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <button className="brand" onClick={room ? undefined : () => setScreen('home')} aria-label="Panic Protocol home">
          <span className="brand-mark"><Siren size={18} strokeWidth={1.8} /></span>
          <span>PANIC<span className="brand-light"> PROTOCOL</span></span>
        </button>
        <div className="topbar-right">
          <span className={`connection-pill ${connected ? 'online' : 'offline'}`}>
            {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connected ? 'SYSTEM ONLINE' : 'RECONNECTING'}
          </span>
          {room && <span className="session-tag"><span className="live-dot" /> LIVE SESSION</span>}
        </div>
      </header>

      {screen === 'home' || !room ? (
        <Landing
          nickname={nickname}
          setNickname={setNickname}
          roomCode={roomCode}
          setRoomCode={setRoomCode}
          joining={joining}
          setJoining={setJoining}
          loading={loading}
          error={error}
          clearError={() => setError('')}
          onCreate={() => joinOrCreate('room:create')}
          onJoin={() => joinOrCreate('room:join')}
        />
      ) : (
        <section className="room-layout">
          <div className="room-toolbar">
            <button className="back-button" onClick={leaveRoom}><ArrowLeft size={15} /> EXIT SESSION</button>
            <div className="room-code-chip">
              <span>ROOM CODE</span><strong>{room.code}</strong>
              <button onClick={copyCode} aria-label="Copy room code">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
            </div>
          </div>

          {room.phase === 'lobby' && (
            <Lobby room={room} playerId={playerId} isHost={isHost} connected={connected} loading={loading}
              onReady={() => submit('player:ready', { ready: !me?.ready })}
              onStart={() => submit('game:start')}
              onSelectLevel={(levelId) => submit('game:level:set', { levelId })}
              error={error} />
          )}
          {room.phase === 'playing' && room.arena && (
            <GameArena room={room} me={me} playerId={playerId} socket={socket}
              secondsLeft={secondsLeft} error={error} clearError={() => setError('')}
              onActionError={setError} />
          )}
          {room.phase === 'finished' && (
            <FinalReport room={room} isHost={isHost} loading={loading}
              onReplay={() => submit('game:replay')}
              onContinue={() => submit('game:next-level')} />
          )}
          <footer className="room-footer">
            <span><LockKeyhole size={12} /> SECURE CO-OP CHANNEL</span>
            <span>LEVEL {room.phase === 'lobby' ? levelPreviews.find((level) => level.id === room.selectedLevel)?.number : room.arena?.levelNumber ?? room.result?.levelNumber ?? '—'} / {room.totalLevels}</span>
            <span>{room.players.filter((player) => player.connected).length} OPERATORS ACTIVE</span>
          </footer>
        </section>
      )}
      <div className={`corner-note ${room ? 'in-room' : ''}`}><span>PP / 01</span><span>CYBER CITY SURVIVAL</span></div>
    </main>
  )
}

function Landing(props: {
  nickname: string
  setNickname: (value: string) => void
  roomCode: string
  setRoomCode: (value: string) => void
  joining: boolean
  setJoining: (value: boolean) => void
  loading: boolean
  error: string
  clearError: () => void
  onCreate: () => void
  onJoin: () => void
}) {
  return (
    <section className="landing">
      <div className="landing-top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> GLOBAL RESPONSE NETWORK <span className="eyebrow-live">● ACTIVE</span></div>
          <h1>WHEN THE CITY<br />GOES <span>DARK.</span></h1>
          <p className="hero-subtitle">One city. One crew. Get everyone out.</p>
          <p className="hero-description">Team up in a live cyber-city, power up the network, and reach extraction before lockdown.</p>
          <div className="hero-facts">
            <div><Users size={16} /><span>2—6 OPERATORS</span></div>
          </div>
        </div>
        <div className="entry-panel">
          <div className="panel-top"><span><Radio size={14} /> OPERATOR ACCESS</span><span>SECURE UPLINK <span className="tiny-green">●</span></span></div>
          <div className="panel-heading">
            <div className="panel-icon"><Fingerprint size={21} /></div>
            <div><h2>ENTER THE RESPONSE</h2><p>Create a room or join your team.</p></div>
          </div>
          <label className="field-label" htmlFor="nickname">CALLSIGN <span>REQUIRED</span></label>
          <div className="input-wrap"><span className="input-prefix">›</span><input id="nickname" maxLength={18} value={props.nickname} onChange={(event) => { props.setNickname(event.target.value); props.clearError() }} placeholder="Enter your callsign" onKeyDown={(event) => event.key === 'Enter' && !props.joining && props.onCreate()} /></div>
          {props.joining && <>
            <label className="field-label room-code-label" htmlFor="roomcode">ROOM CODE</label>
            <div className="input-wrap"><span className="input-prefix"><Crosshair size={14} /></span><input id="roomcode" maxLength={5} value={props.roomCode} onChange={(event) => props.setRoomCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ''))} placeholder="5-CHARACTER CODE" className="code-input" /></div>
          </>}
          {props.error && <div className="error-message" role="alert"><ShieldAlert size={14} />{props.error}</div>}
          <button className="primary-button" disabled={props.loading || props.nickname.trim().length < 2 || (props.joining && props.roomCode.length !== 5)} onClick={props.joining ? props.onJoin : props.onCreate}>
            {props.loading ? <LoaderCircle className="spin" size={17} /> : props.joining ? <ArrowRight size={17} /> : <Siren size={17} />}
            {props.loading ? 'CONNECTING...' : props.joining ? 'JOIN RESPONSE TEAM' : 'CREATE ROOM'}
          </button>
          <div className="entry-divider"><span /> OR <span /></div>
          <button className="secondary-button" onClick={() => { props.setJoining(!props.joining); props.clearError() }}>
            {props.joining ? <><ArrowLeft size={15} /> BACK TO CREATE ROOM</> : <><Users size={15} /> JOIN WITH ROOM CODE <ArrowDownRight size={14} /></>}
          </button>
          <div className="panel-foot"><ShieldCheck size={13} /><span>Your session is private. Share your room code only with your team.</span></div>
        </div>
      </div>
    </section>
  )
}

const levelPreviews = [
  {
    id: 'power-outage',
    number: 1,
    name: 'Power Outage',
    description: 'Collect energy cells, activate power terminals, and reach extraction.',
    difficulty: 'EASY',
    art: 'power',
  },
  {
    id: 'drone-invasion',
    number: 2,
    name: 'Drone Invasion',
    description: 'Navigate a harder map, avoid enemy drones, and coordinate with your team.',
    difficulty: 'MEDIUM',
    art: 'drones',
  },
  {
    id: 'final-extraction',
    number: 3,
    name: 'Final Extraction',
    description: 'Survive industrial hazards, complete final objectives, and escape.',
    difficulty: 'HARD',
    art: 'extraction',
  },
] as const

function LevelPreviews({ selectedLevel, unlockedLevel, canSelect, onSelect }: {
  selectedLevel: LevelId | null
  unlockedLevel: number
  canSelect: boolean
  onSelect: (levelId: LevelId) => void
}) {
  return (
    <section className="level-previews" aria-labelledby="level-previews-heading">
      <div className="level-previews-heading">
        <div>
          <p className="overline">MISSION BRIEFING / HOST SELECTS FOR THE TEAM</p>
          <h2 id="level-previews-heading">Choose your level</h2>
        </div>
        <span className="preview-label"><Activity size={13} /> PROGRESSION {Math.min(unlockedLevel, 3)} / 3</span>
      </div>
      <p className="level-preview-note">{canSelect
        ? 'All three maps are playable. Choose one to set the mission; no level starts until the host makes a selection.'
        : 'All three maps are playable. The host selects for the team; cleared levels record your progression.'}</p>
      <div className="level-preview-list">
        {levelPreviews.map((level) => (
          <LevelCard
            key={level.number}
            level={level}
            selected={selectedLevel === level.id}
            disabled={!canSelect}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}

function LevelCard({ level, selected, disabled, onSelect }: {
  level: (typeof levelPreviews)[number]
  selected: boolean
  disabled: boolean
  onSelect: (levelId: LevelId) => void
}) {
  const className = `level-preview-card level-${level.art}${selected ? ' selected' : ''}`
  const contents = (
    <>
      <div className="level-art" aria-hidden="true">
        <LevelArtwork art={level.art} />
        <span className="level-art-number">LEVEL {String(level.number).padStart(2, '0')}</span>
      </div>
      <div className="level-preview-copy">
        <div className="level-title-row">
          <span className="level-number">{String(level.number).padStart(2, '0')}</span>
          <h3>{level.name}</h3>
        </div>
        <p>{level.description}</p>
        <span className={`level-difficulty difficulty-${level.difficulty.toLowerCase()}`}>
          <i /> {level.difficulty}
        </span>
        <span className={`level-status ${selected ? 'is-selected' : ''}`}>
          {selected ? 'SELECTED FOR THIS ROOM' : disabled ? 'AWAITING HOST SELECTION' : 'AVAILABLE — SELECT FOR THIS MISSION'}
        </span>
      </div>
    </>
  )
  return (
    <button type="button" className={className} disabled={disabled}
      aria-pressed={selected} onClick={() => onSelect(level.id)}>
      {contents}
    </button>
  )
}

function LevelArtwork({ art }: { art: (typeof levelPreviews)[number]['art'] }) {
  if (art === 'power') {
    return (
      <svg viewBox="0 0 480 170" preserveAspectRatio="xMidYMid slice">
        <path className="art-grid-lines" d="M0 42H480M0 85H480M0 128H480M60 0V170M120 0V170M180 0V170M240 0V170M300 0V170M360 0V170M420 0V170" />
        <path className="art-district-lines" d="M18 170V105L58 79L98 105V170M382 170V91L424 62L465 91V170" />
        <path className="art-corridor" d="M20 128H116V57H185V128H276V72H347V128H456" />
        <path className="art-corridor-edge" d="M20 137H108V66H176V137H267V81H338V137H456" />
        <rect className="art-energy" x="131" y="91" width="13" height="13" transform="rotate(45 137.5 97.5)" />
        <rect className="art-energy" x="299" y="98" width="13" height="13" transform="rotate(45 305.5 104.5)" />
        <circle className="art-player-glow" cx="224" cy="127" r="17" />
        <circle className="art-player" cx="224" cy="127" r="7" />
      </svg>
    )
  }
  if (art === 'drones') {
    return (
      <svg viewBox="0 0 480 170" preserveAspectRatio="xMidYMid slice">
        <path className="art-grid-lines" d="M0 42H480M0 85H480M0 128H480M60 0V170M120 0V170M180 0V170M240 0V170M300 0V170M360 0V170M420 0V170" />
        <path className="art-maze" d="M25 24H155V62H80V139H191V96H256V145H342V103H430V148M193 24H272V62H346V24H453M25 93H55M379 62H453" />
        <path className="art-maze-glow" d="M25 24H155V62H80V139H191V96H256V145H342V103H430V148" />
        <path className="art-drone" d="M318 75L331 88L318 101L305 88Z" />
        <circle className="art-drone-ring" cx="318" cy="88" r="19" />
        <rect className="art-energy" x="209" y="43" width="12" height="12" transform="rotate(45 215 49)" />
        <circle className="art-warning-light" cx="53" cy="59" r="4" />
        <circle className="art-warning-light" cx="431" cy="83" r="4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 480 170" preserveAspectRatio="xMidYMid slice">
      <path className="art-grid-lines" d="M0 42H480M0 85H480M0 128H480M60 0V170M120 0V170M180 0V170M240 0V170M300 0V170M360 0V170M420 0V170" />
      <path className="art-reactor-beams" d="M20 24L185 76M460 22L299 75M20 148L184 101M460 148L300 101" />
      <circle className="art-reactor-ring outer" cx="240" cy="86" r="58" />
      <circle className="art-reactor-ring middle" cx="240" cy="86" r="39" />
      <circle className="art-reactor-core" cx="240" cy="86" r="20" />
      <path className="art-extraction-zone" d="M375 50H450V122H375Z" />
      <path className="art-extraction-chevron" d="M398 72L414 86L398 100M416 72L432 86L416 100" />
      <circle className="art-warning-light" cx="58" cy="46" r="4" />
      <circle className="art-warning-light" cx="92" cy="127" r="4" />
    </svg>
  )
}

function Lobby({ room, playerId, isHost, connected, loading, onReady, onStart, onSelectLevel, error }: {
  room: RoomState
  playerId: string
  isHost: boolean
  connected: boolean
  loading: boolean
  onReady: () => void
  onStart: () => void
  onSelectLevel: (levelId: LevelId) => void
  error: string
}) {
  const activeCount = room.players.filter((player) => player.connected).length
  const validLevelSelected = room.selectedLevel !== null && levelPreviews.some((level) => level.id === room.selectedLevel)
  const canStart = connected && !loading && activeCount >= 2 && validLevelSelected
  const startHint = !connected
    ? 'Reconnecting to the command center before the mission can start.'
    : activeCount < 2
      ? 'Waiting for operators — at least two connected players are required.'
      : !validLevelSelected
        ? 'Host must select one of the three mission cards before starting.'
        : ''
  return (
    <div className="lobby-content">
    <div className="lobby-grid">
      <section className="lobby-main">
        <div className="section-kicker"><span className="status-dot" /> NETWORK ESTABLISHED <span className="kicker-line" /></div>
        <div className="lobby-heading"><div><p className="overline">COORDINATION HUB / {room.code}</p><h1>ASSEMBLE YOUR<br /><span>RESPONSE TEAM.</span></h1></div><div className="team-count"><strong>{activeCount.toString().padStart(2, '0')}</strong><span>OPERATORS<br />CONNECTED</span></div></div>
        <div className="players-head"><span>OPERATOR ROSTER</span><span>{activeCount} / 6 SLOTS</span></div>
        <div className="player-list">
          {room.players.map((player, index) => <div className={`player-card ${!player.connected ? 'disconnected' : ''}`} key={player.id}>
            <div className="player-avatar">{player.nickname.slice(0, 1).toUpperCase()}<span className={player.connected ? 'avatar-online' : 'avatar-offline'} /></div>
            <div className="player-meta"><strong>{player.nickname}{player.id === playerId ? <span className="you-tag">YOU</span> : null}</strong><span>{player.id === room.hostId ? 'MISSION COMMANDER' : 'RESPONSE OPERATOR'}</span></div>
            <div className={`player-status ${player.connected ? player.ready ? 'ready' : 'standby' : 'offline-status'}`}>{player.id === room.hostId ? <><Crosshair size={12} /> HOST</> : player.connected ? player.ready ? <><CheckCircle2 size={12} /> READY</> : <><Activity size={12} /> STANDBY</> : <><WifiOff size={12} /> OFFLINE</>}</div>
          </div>)}
          {Array.from({ length: Math.max(0, 6 - room.players.length) }, (_, index) => <div className="empty-player" key={`empty-${index}`}><div className="empty-avatar"><Users size={15} /></div><span>AWAITING OPERATOR</span><span className="empty-slot">SLOT {String(room.players.length + index + 1).padStart(2, '0')}</span></div>)}
        </div>
        {activeCount < 2 && <p className="operator-waiting"><Activity size={13} /> WAITING FOR OPERATORS TO JOIN</p>}
        {error && <div className="error-message lobby-error" role="alert"><ShieldAlert size={14} />{error}</div>}
        <div className="lobby-actions">
          <button className="secondary-button" onClick={onReady} disabled={loading || isHost}>{isHost ? <><ShieldCheck size={15} /> COMMANDER READY</> : room.players.find((player) => player.id === playerId)?.ready ? <><Check size={15} /> READY — CLICK TO STAND BY</> : <><CheckCircle2 size={15} /> CONFIRM READY</>}</button>
          {isHost ? <button className="primary-button" disabled={!canStart} onClick={onStart}>{loading ? <LoaderCircle size={16} className="spin" /> : <Zap size={16} />} START MISSION <ArrowRight size={15} /></button> : <div className="waiting-host"><LoaderCircle size={15} className="slow-spin" /> WAITING FOR COMMANDER</div>}
        </div>
        {isHost && startHint && <p className="start-hint" role="status">{startHint}</p>}
      </section>
      <aside className="lobby-side">
        <div className="side-card briefing-card"><div className="side-card-label"><Clipboard size={14} /> MISSION PROTOCOL</div><h3>THE CITY IS COUNTING ON YOU.</h3><p>Enter one of three playable maps, collect energy, activate its terminals, and extract together before lockdown.</p><div className="briefing-rule"><span>01</span><p><strong>MOVE</strong> — WASD or arrow keys. Use the on-screen pad on phones.</p></div><div className="briefing-rule"><span>02</span><p><strong>RECOVER</strong> — Collect glowing energy cells; avoid hazards and drones.</p></div><div className="briefing-rule"><span>03</span><p><strong>COOPERATE</strong> — Spend two cells per terminal, rescue downed teammates, then extract.</p></div></div>
        <div className="side-card system-card"><div className="side-card-label"><Signal size={14} /> LIVE SYSTEMS</div><div className="system-row"><span>ARENA SIMULATION</span><b>READY</b></div><div className="system-row"><span>CO-OP UPLINK</span><b>ACTIVE</b></div><div className="system-row"><span>OPERATORS ONLINE</span><b>{activeCount} / 6</b></div><div className="system-meter"><span /></div><div className="system-foot"><span>AWAITING DEPLOYMENT</span><span>●</span></div></div>
      </aside>
    </div>
    <LevelPreviews selectedLevel={room.selectedLevel} unlockedLevel={room.unlockedLevel}
      canSelect={isHost && connected && !loading} onSelect={onSelectLevel} />
    </div>
  )
}

function GameArena({ room, me, playerId, socket, secondsLeft, error, clearError, onActionError }: {
  room: RoomState
  me: Player | null
  playerId: string
  socket: Socket | null
  secondsLeft: number
  error: string
  clearError: () => void
  onActionError: (message: string) => void
}) {
  const arena = room.arena!
  const heldDirections = useRef(new Set<string>())
  const activeTerminals = arena.terminals.filter((terminal) => terminal.active).length
  const levelPowered = activeTerminals === arena.terminals.length
  const timerUrgent = secondsLeft <= 30
  const extractionSecondsLeft = arena.extractionEndsAt
    ? Math.max(0, Math.ceil((arena.extractionEndsAt - Date.now()) / 1000))
    : null
  const formatTime = `${Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`
  const missionBrief = arena.levelId === 'power-outage'
    ? 'POWER RESTORE: gather cells, bring both city terminals online, then interact at extraction.'
    : arena.levelId === 'drone-invasion'
      ? 'DRONE INVASION: use maze cover to break drone pursuit; power all three relays and extract.'
      : 'FINAL EXTRACTION: dodge patrolling reactor surges, power four relays, then hold extraction together for 12 seconds.'
  const setDirection = useCallback((direction: string, active: boolean) => {
    if (!socket?.connected) return
    const isHeld = heldDirections.current.has(direction)
    if (active === isHeld) return
    if (active) heldDirections.current.add(direction)
    else heldDirections.current.delete(direction)
    const directions = heldDirections.current
    const dx = Number(directions.has('right')) - Number(directions.has('left'))
    const dy = Number(directions.has('down')) - Number(directions.has('up'))
    socket.emit('game:input', { dx, dy }, (result: Ack) => {
      if (!result.ok) onActionError(result.error || 'Movement could not be applied.')
    })
  }, [onActionError, socket])

  useEffect(() => {
    const keyDirections: Record<string, string> = {
      w: 'up', ArrowUp: 'up', s: 'down', ArrowDown: 'down',
      a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right',
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
      const direction = keyDirections[event.key]
      if (!direction) return
      event.preventDefault()
      setDirection(direction, true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const direction = keyDirections[event.key]
      if (direction) setDirection(direction, false)
    }
    const stop = () => {
      heldDirections.current.clear()
      if (socket?.connected) socket.emit('game:input', { dx: 0, dy: 0 })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', stop)
      stop()
    }
  }, [setDirection, socket])

  const interact = () => {
    if (!socket?.connected) {
      onActionError('Connection lost. Reconnecting to command center…')
      return
    }
    clearError()
    socket.emit('game:interact', {}, (result: Ack) => {
      if (!result.ok) onActionError(result.error || 'Could not interact.')
    })
  }

  const styleAt = (x: number, y: number) => ({
    left: `${(x / arena.width) * 100}%`,
    top: `${(y / arena.height) * 100}%`,
  })

  return (
    <div className="arena-layout">
      <div className="arena-header">
        <div><div className="section-kicker"><span className="status-dot danger" /> LIVE MISSION <span className="kicker-line" /></div><p className="overline">{arena.levelName} <span>/</span> LEVEL {arena.levelNumber} OF {room.totalLevels} · {arena.difficulty}</p></div>
        <div className={`arena-timer ${timerUrgent ? 'urgent' : ''}`}><span>LOCKDOWN IN</span><strong>{formatTime}</strong></div>
      </div>
      <div className="arena-objectives">
        <span><Zap size={14} /> TEAM ENERGY <b>{room.teamEnergy}</b></span>
        <span><Crosshair size={14} /> TERMINALS <b>{activeTerminals}/{arena.terminals.length}</b></span>
        <span><Activity size={14} /> CELLS LEFT <b>{arena.pickups.length}</b></span>
        <span><Shield size={14} /> SCORE <b>{room.teamScore.toLocaleString()}</b></span>
      </div>
      <p className="arena-hint">{extractionSecondsLeft !== null
        ? `EXTRACTION LOCKING IN ${extractionSecondsLeft}s — EVERY CONNECTED OPERATOR MUST HOLD THE ZONE.`
        : levelPowered
          ? arena.extractionSeconds > 0
            ? 'OBJECTIVES COMPLETE — ASSEMBLE AT EXTRACTION AND INTERACT TO BEGIN THE FINAL HOLD.'
            : 'LEVEL OBJECTIVES COMPLETE — ALL CONNECTED OPERATORS MUST REACH EXTRACTION AND INTERACT.'
          : `COLLECT ENERGY CELLS AND ACTIVATE THE ${arena.terminals.length - activeTerminals} REMAINING TERMINAL${arena.terminals.length - activeTerminals === 1 ? '' : 'S'}.`}
      </p>
      <p className="mission-brief">{missionBrief}</p>
      <div className={`arena-board arena-board-${arena.levelId}`} role="application" aria-label={`${arena.levelName} game arena. Use WASD or arrow keys to move.`}>
        <div className="arena-grid" />
        {arena.walls.map((wall) => <div key={wall.id} className="arena-wall" style={{ ...styleAt(wall.x, wall.y), width: `${wall.width / arena.width * 100}%`, height: `${wall.height / arena.height * 100}%` }} />)}
        {arena.hazards.map((hazard) => <div key={hazard.id} className={`arena-hazard${hazard.patrol ? ' patrolling' : ''}`} style={styleAt(hazard.x, hazard.y)} title={hazard.patrol ? 'Moving reactor surge' : 'Electrical hazard'} />)}
        {arena.pickups.map((pickup) => <div key={pickup.id} className="arena-pickup" style={styleAt(pickup.x, pickup.y)} title="Energy cell" />)}
        {arena.terminals.map((terminal) => <div key={terminal.id} className={`arena-terminal ${terminal.active ? 'active' : ''}`} style={styleAt(terminal.x, terminal.y)} title={terminal.active ? 'Terminal online' : 'Terminal offline — requires 2 energy'}><span /></div>)}
        <div className={`arena-extraction${extractionSecondsLeft !== null ? ' securing' : ''}`} style={styleAt(arena.extraction.x, arena.extraction.y)} title="Extraction point">EXTRACT</div>
        {arena.drones.map((drone) => (
          <div key={drone.id} className="arena-drone" style={styleAt(drone.x, drone.y)} title="Hostile drone" aria-label="Hostile drone">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="7" cy="7" r="3.5" />
              <circle cx="25" cy="7" r="3.5" />
              <circle cx="7" cy="25" r="3.5" />
              <circle cx="25" cy="25" r="3.5" />
              <path d="M9 9l5 5m9-5-5 5m-9 9 5-5m9 5-5-5" />
              <path className="drone-core" d="M16 10.5 21.5 16 16 21.5 10.5 16 16 10.5Z" />
            </svg>
          </div>
        ))}
        {room.players.filter((player) => player.connected).map((player, index) => (
          <div key={player.id} className={`arena-player ${player.id === playerId ? 'is-me' : ''} ${player.downed ? 'is-downed' : ''}`}
            style={{ ...styleAt(player.x, player.y), '--player-tint': `hsl(${(index * 58 + 165) % 360} 78% 66%)` } as React.CSSProperties}
            title={`${player.nickname} — ${player.downed ? 'down' : `health ${player.health}%`}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="7" r="3.2" />
              <path d="M5.5 20v-1.8a6.5 6.5 0 0 1 13 0V20z" />
            </svg>
          </div>
        ))}
      </div>
      <div className="arena-legend"><span><i className="legend-cell" /> ENERGY CELL</span><span><i className="legend-terminal" /> TERMINAL</span><span><i className="legend-hazard" /> HAZARD</span><span><i className="legend-drone" /> DRONE</span><span>WALLS BLOCK MOVEMENT</span></div>
      <div className="arena-controls">
        <div className="arena-team">
          <div className="arena-team-heading">TEAM VITALS <span>{room.players.filter((player) => player.connected).length} ACTIVE</span></div>
          {room.players.map((player) => <div className={`vitals-row ${player.downed ? 'down' : ''}`} key={player.id}>
            <span className="vitals-name">{player.nickname}{player.id === playerId ? ' (YOU)' : ''}</span>
            <span className="health-track"><i style={{ width: `${player.health}%` }} /></span>
            <span className="vitals-health">{player.downed ? 'DOWN' : `${player.health}%`}</span>
            <span className="vitals-lives"><Heart size={12} /> {player.lives}</span>
          </div>)}
          {me?.downed && <p className="down-warning">You are down. A teammate must interact nearby to revive you.</p>}
        </div>
        <div className="control-cluster">
          <div className="dpad" aria-label="Touch movement controls">
            <button aria-label="Move up" onPointerDown={(event) => { event.preventDefault(); setDirection('up', true) }} onPointerUp={() => setDirection('up', false)} onPointerLeave={() => setDirection('up', false)} onPointerCancel={() => setDirection('up', false)}><ArrowUp size={17} /></button>
            <button aria-label="Move left" onPointerDown={(event) => { event.preventDefault(); setDirection('left', true) }} onPointerUp={() => setDirection('left', false)} onPointerLeave={() => setDirection('left', false)} onPointerCancel={() => setDirection('left', false)}><ArrowLeft size={17} /></button>
            <button aria-label="Move down" onPointerDown={(event) => { event.preventDefault(); setDirection('down', true) }} onPointerUp={() => setDirection('down', false)} onPointerLeave={() => setDirection('down', false)} onPointerCancel={() => setDirection('down', false)}><ArrowDown size={17} /></button>
            <button aria-label="Move right" onPointerDown={(event) => { event.preventDefault(); setDirection('right', true) }} onPointerUp={() => setDirection('right', false)} onPointerLeave={() => setDirection('right', false)} onPointerCancel={() => setDirection('right', false)}><ArrowRight size={17} /></button>
          </div>
          <div className="control-actions"><p>HOLD WASD / ARROWS TO MOVE</p><button className="primary-button interact-button" onClick={interact} disabled={extractionSecondsLeft !== null}><Crosshair size={15} /> {extractionSecondsLeft !== null ? `EXTRACTION ${extractionSecondsLeft}s` : 'INTERACT / RESCUE'}</button></div>
        </div>
      </div>
      {error && <div className="error-message arena-error" role="alert"><ShieldAlert size={14} />{error}</div>}
    </div>
  )
}

function FinalReport({ room, isHost, loading, onReplay, onContinue }: {
  room: RoomState
  isHost: boolean
  loading: boolean
  onReplay: () => void
  onContinue: () => void
}) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score)
  const result = room.result
  const victory = result?.outcome === 'victory'
  return <div className="report-wrap">
    <div className={`report-icon ${victory ? '' : 'report-defeat'}`}>{victory ? <ShieldCheck size={27} /> : <ShieldAlert size={27} />}</div>
    <div className="section-kicker"><span className={`status-dot ${victory ? '' : 'danger'}`} /> {victory ? 'MISSION COMPLETE' : 'MISSION FAILED'} <span className="kicker-line" /></div>
    <p className="overline">AFTER ACTION REPORT / {room.code} / LEVEL {result?.levelNumber}</p>
    <h1>{victory ? <>{result?.levelName}<br /><span>COMPLETE.</span></> : <>SIGNAL<br /><span>LOST.</span></>}</h1>
    <p className="report-intro">{result?.reason}</p>
    <div className="report-score"><span>FINAL TEAM SCORE</span><strong>{(result?.score ?? room.teamScore).toLocaleString()}</strong><small>{result?.levelName} {victory ? 'CLEARED' : 'NOT CLEARED'} · {room.unlockedLevel} / {room.totalLevels} UNLOCKED</small></div>
    <div className="report-roster"><div className="players-head"><span>OPERATOR PERFORMANCE</span><span>FINAL SCORE</span></div>{ranked.map((player, index) => <div className="report-player" key={player.id}><span className="rank-number">0{index + 1}</span><span className="report-name">{player.nickname}{player.id === room.hostId && <small> COMMANDER</small>}</span><strong>{player.score.toLocaleString()} <small>PTS</small></strong></div>)}</div>
    <div className="report-action">
      {isHost ? <div className="report-actions">
        <button className="secondary-button" disabled={loading} onClick={onReplay}>{loading ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />} REPLAY LEVEL</button>
        {victory && result && result.levelNumber < room.unlockedLevel && <button className="primary-button" disabled={loading} onClick={onContinue}><ArrowRight size={16} /> PROCEED TO LEVEL {result.levelNumber + 1}</button>}
      </div> : <span><LoaderCircle size={14} className="slow-spin" /> WAITING FOR COMMANDER</span>}
    </div>
  </div>
}

export default App
