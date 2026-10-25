import { useCallback, useEffect, useMemo, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Crosshair,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Siren,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import type { Ack, RoomState } from './types'

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
  const [choice, setChoice] = useState('')
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
    setChoice('')
  }, [room?.round, room?.phase])

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

  const score = room?.teamScore ?? 0
  const submittedCount = room?.players.filter((player) => player.submitted).length ?? 0
  const timerPercent = room?.roundSeconds ? Math.max(0, (secondsLeft / room.roundSeconds) * 100) : 0

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
            <Lobby room={room} playerId={playerId} isHost={isHost} loading={loading}
              onReady={() => submit('player:ready', { ready: !me?.ready })}
              onStart={() => submit('game:start')}
              error={error} />
          )}
          {(room.phase === 'playing' || room.phase === 'result') && room.scenario && (
            <Mission room={room} me={me} secondsLeft={secondsLeft} timerPercent={timerPercent}
              score={score} submittedCount={submittedCount} choice={choice} setChoice={setChoice}
              loading={loading} error={error}
              onSubmit={() => submit('game:submit', { choiceId: choice })} />
          )}
          {room.phase === 'finished' && (
            <FinalReport room={room} isHost={isHost} loading={loading} onReplay={() => submit('game:replay')} />
          )}
          <footer className="room-footer">
            <span><LockKeyhole size={12} /> SECURE CO-OP CHANNEL</span>
            <span>MISSION {room.round || '—'} / {room.totalRounds}</span>
            <span>{room.players.filter((player) => player.connected).length} OPERATORS ACTIVE</span>
          </footer>
        </section>
      )}
      <div className="corner-note"><span>PP / 01</span><span>CRISIS RESPONSE SIMULATOR</span></div>
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
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" /> GLOBAL RESPONSE NETWORK <span className="eyebrow-live">● ACTIVE</span></div>
        <h1>WHEN THE CITY<br />GOES <span>DARK.</span></h1>
        <p className="hero-subtitle">Six crises. One team. No room for panic.</p>
        <p className="hero-description">Coordinate with your crew, make the call, and keep the city standing. Every decision counts. Every second matters.</p>
        <div className="hero-facts">
          <div><Users size={16} /><span>2—6 OPERATORS</span></div>
          <div><Activity size={16} /><span>6 LIVE SCENARIOS</span></div>
          <div><Zap size={15} /><span>~5 MINUTES</span></div>
        </div>
        <div className="hero-coordinate"><span>37°46'49.0"N</span><span>122°25'09.0"W</span><span>NETWORK NODE / WEST</span></div>
      </div>
      <div className="entry-panel">
        <div className="panel-top"><span><Radio size={14} /> OPERATOR ACCESS</span><span>SECURE UPLINK <span className="tiny-green">●</span></span></div>
        <div className="panel-heading">
          <div className="panel-icon"><Fingerprint size={21} /></div>
          <div><h2>JOIN THE RESPONSE</h2><p>Identify yourself to enter the network.</p></div>
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
          {props.loading ? 'CONNECTING...' : props.joining ? 'JOIN RESPONSE TEAM' : 'CREATE A RESPONSE ROOM'}
        </button>
        <div className="entry-divider"><span /> OR <span /></div>
        <button className="secondary-button" onClick={() => { props.setJoining(!props.joining); props.clearError() }}>
          {props.joining ? <><ArrowLeft size={15} /> BACK TO CREATE ROOM</> : <><Users size={15} /> JOIN WITH ROOM CODE <ArrowDownRight size={14} /></>}
        </button>
        <div className="panel-foot"><ShieldCheck size={13} /><span>Your session is private. Share your room code only with your team.</span></div>
      </div>
      <div className="landing-bottom"><div><span className="bottom-mark">01</span><span>ASSESS THE SIGNAL</span></div><div><span className="bottom-mark">02</span><span>COORDINATE RESPONSE</span></div><div><span className="bottom-mark">03</span><span>PROTECT THE CITY</span></div><span className="version">PROTOCOL v1.0.4</span></div>
    </section>
  )
}

function Lobby({ room, playerId, isHost, loading, onReady, onStart, error }: {
  room: RoomState
  playerId: string
  isHost: boolean
  loading: boolean
  onReady: () => void
  onStart: () => void
  error: string
}) {
  const activeCount = room.players.filter((player) => player.connected).length
  return (
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
        {error && <div className="error-message lobby-error" role="alert"><ShieldAlert size={14} />{error}</div>}
        <div className="lobby-actions">
          <button className="secondary-button" onClick={onReady} disabled={loading || isHost}>{isHost ? <><ShieldCheck size={15} /> COMMANDER READY</> : room.players.find((player) => player.id === playerId)?.ready ? <><Check size={15} /> READY — CLICK TO STAND BY</> : <><CheckCircle2 size={15} /> CONFIRM READY</>}</button>
          {isHost ? <button className="primary-button" disabled={loading || activeCount < 2} onClick={onStart}>{loading ? <LoaderCircle size={16} className="spin" /> : <Zap size={16} />} INITIATE MISSION <ArrowRight size={15} /></button> : <div className="waiting-host"><LoaderCircle size={15} className="slow-spin" /> WAITING FOR COMMANDER</div>}
        </div>
        {activeCount < 2 && <p className="start-hint">A second operator must connect before the mission can begin.</p>}
      </section>
      <aside className="lobby-side">
        <div className="side-card briefing-card"><div className="side-card-label"><Clipboard size={14} /> MISSION PROTOCOL</div><h3>THE CITY IS COUNTING ON YOU.</h3><p>Your team will face six escalating city-wide crises. Review each situation, discuss your response, and submit your decision before the clock expires.</p><div className="briefing-rule"><span>01</span><p><strong>ASSESS</strong> — Read the incident brief and field intelligence.</p></div><div className="briefing-rule"><span>02</span><p><strong>DECIDE</strong> — Choose one response. Your submission is final.</p></div><div className="briefing-rule"><span>03</span><p><strong>COORDINATE</strong> — Correct calls earn 100 points. A team majority earns a 200 point bonus.</p></div></div>
        <div className="side-card system-card"><div className="side-card-label"><Signal size={14} /> LIVE SYSTEMS</div><div className="system-row"><span>CRISIS SIMULATION</span><b>READY</b></div><div className="system-row"><span>COMMS ENCRYPTION</span><b>ACTIVE</b></div><div className="system-row"><span>OPERATORS ONLINE</span><b>{activeCount} / 6</b></div><div className="system-meter"><span /></div><div className="system-foot"><span>ALL SYSTEMS NOMINAL</span><span>●</span></div></div>
      </aside>
    </div>
  )
}

function Mission({ room, me, secondsLeft, timerPercent, score, submittedCount, choice, setChoice, loading, error, onSubmit }: {
  room: RoomState
  me: RoomState['players'][number] | null
  secondsLeft: number
  timerPercent: number
  score: number
  submittedCount: number
  choice: string
  setChoice: (value: string) => void
  loading: boolean
  error: string
  onSubmit: () => void
}) {
  const scenario = room.scenario!
  const result = room.result
  const canSelect = room.phase === 'playing' && !me?.submitted
  const timerUrgent = secondsLeft <= 10 && room.phase === 'playing'
  return (
    <div className="mission-layout">
      <div className="mission-header">
        <div><div className="section-kicker"><span className="status-dot danger" /> INCIDENT RESPONSE <span className="kicker-line" /></div><p className="overline">{scenario.sector} <span>/</span> INCIDENT {String(room.round).padStart(2, '0')}</p></div>
        <div className={`timer-box ${timerUrgent ? 'urgent' : ''}`}><span>{room.phase === 'result' ? 'DECISION LOCKED' : 'TIME REMAINING'}</span><strong>{room.phase === 'result' ? '— —' : `00:${String(secondsLeft).padStart(2, '0')}`}</strong><div className="timer-track"><span style={{ width: `${room.phase === 'result' ? 0 : timerPercent}%` }} /></div></div>
      </div>
      {room.phase === 'result' ? <div className="result-banner"><div className="result-icon"><CheckCircle2 size={20} /></div><div><span>ROUND {room.round} RESOLVED {result?.timedOut ? '· TIMER EXPIRED' : '· ALL RESPONSES RECEIVED'}</span><strong>{result?.correctVotes ?? 0} correct operator {result?.correctVotes === 1 ? 'call' : 'calls'} <i>+{result?.pointsAwarded ?? 0} TEAM POINTS</i></strong></div><div className="result-next"><LoaderCircle size={14} className="slow-spin" /> NEXT INCIDENT INCOMING</div></div> : null}
      <div className="mission-content">
        <section className="scenario-panel">
          <div className="scenario-label"><span className={`severity-badge ${scenario.severity.toLowerCase()}`}><span className="severity-dot" /> {scenario.severity} PRIORITY</span><span className="scenario-tag"><Activity size={12} /> FIELD REPORT / VERIFIED</span></div>
          <h1>{scenario.title}</h1>
          <p className="scenario-brief">{scenario.brief}</p>
          <div className="intel-box"><span><Radio size={14} /> INTELLIGENCE UPDATE</span><p>{scenario.intel}</p></div>
          <div className="sector-footer"><span><Crosshair size={12} /> SECTOR: {scenario.sector}</span><span>LIVE FEED <span className="live-dot" /></span></div>
        </section>
        <aside className="decision-panel">
          <div className="decision-heading"><div><p className="overline">COMMAND DECISION</p><h2>SELECT RESPONSE</h2></div><span>{room.round} / {room.totalRounds}</span></div>
          <div className="choices">
            {scenario.choices.map((option, index) => {
              const picked = choice === option.id
              const correct = result?.correctChoice === option.id
              const votes = result?.votes[option.id] ?? 0
              return <button key={option.id} className={`choice-card ${picked ? 'selected' : ''} ${result && correct ? 'correct-choice' : ''} ${!canSelect ? 'locked' : ''}`} disabled={!canSelect} onClick={() => setChoice(option.id)}>
                <span className="choice-index">0{index + 1}</span>
                <span className="choice-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
                {result ? <span className="choice-votes">{votes} {votes === 1 ? 'VOTE' : 'VOTES'}{correct && <CheckCircle2 size={15} />}</span> : <span className={`choice-radio ${picked ? 'checked' : ''}`}>{picked && <span />}</span>}
              </button>
            })}
          </div>
          {room.phase === 'playing' && <div className="decision-submit">
            {me?.submitted ? <div className="submitted-state"><CheckCircle2 size={16} /><span>RESPONSE LOCKED</span><small>Waiting for team · {submittedCount}/{room.players.filter((player) => player.connected).length}</small></div> :
              <><button className="primary-button" disabled={!choice || loading || secondsLeft === 0} onClick={onSubmit}>{loading ? <LoaderCircle size={16} className="spin" /> : <LockKeyhole size={15} />} LOCK IN RESPONSE <ArrowRight size={15} /></button><p><LockKeyhole size={11} /> FINAL SUBMISSION — YOUR TEAM WILL SEE YOUR CALL AFTER RESOLUTION</p></>}
          </div>}
          {error && <div className="error-message decision-error" role="alert"><ShieldAlert size={14} />{error}</div>}
        </aside>
      </div>
      <div className="mission-stats">
        <div className="stat-cell"><span>TEAM SCORE</span><strong>{score.toLocaleString()}<small> PTS</small></strong></div>
        <div className="stat-cell"><span>TEAM DECISIONS</span><strong>{room.round}<small> / {room.totalRounds}</small></strong></div>
        <div className="stat-cell"><span>OPERATORS RESPONDED</span><strong>{submittedCount}<small> / {room.players.filter((player) => player.connected).length}</small></strong></div>
        <div className="stat-cell response-roster"><span>TEAM STATUS</span><div>{room.players.map((player) => <span title={`${player.nickname}${player.submitted ? ' — submitted' : ''}`} key={player.id} className={`mini-avatar ${player.submitted ? 'responded' : ''} ${!player.connected ? 'missing' : ''}`}>{player.nickname.slice(0, 1).toUpperCase()}</span>)}</div></div>
      </div>
    </div>
  )
}

function FinalReport({ room, isHost, loading, onReplay }: { room: RoomState; isHost: boolean; loading: boolean; onReplay: () => void }) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score)
  const teamScore = room.teamScore
  return <div className="report-wrap">
    <div className="report-icon"><ShieldCheck size={27} /></div>
    <div className="section-kicker"><span className="status-dot" /> OPERATION COMPLETE <span className="kicker-line" /></div>
    <p className="overline">AFTER ACTION REPORT / {room.code}</p>
    <h1>THE CITY<br /><span>STANDS.</span></h1>
    <p className="report-intro">Six incidents. One team. Your response kept the network online.</p>
    <div className="report-score"><span>FINAL TEAM SCORE</span><strong>{teamScore.toLocaleString()}</strong><small>POINTS EARNED</small></div>
    <div className="report-roster"><div className="players-head"><span>OPERATOR PERFORMANCE</span><span>FINAL SCORE</span></div>{ranked.map((player, index) => <div className="report-player" key={player.id}><span className="rank-number">0{index + 1}</span><span className="report-name">{player.nickname}{player.id === room.hostId && <small> COMMANDER</small>}</span><strong>{player.score.toLocaleString()} <small>PTS</small></strong></div>)}</div>
    <div className="report-action">{isHost ? <button className="primary-button" disabled={loading} onClick={onReplay}>{loading ? <LoaderCircle className="spin" size={16} /> : <Zap size={16} />} RUN ANOTHER OPERATION <ArrowRight size={15} /></button> : <span><LoaderCircle size={14} className="slow-spin" /> WAITING FOR COMMANDER TO REDEPLOY</span>}</div>
  </div>
}

export default App
