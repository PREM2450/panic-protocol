export type LevelId = 'power-outage' | 'drone-invasion' | 'final-extraction'

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
  patrol?: {
    axis: 'x' | 'y'
    min: number
    max: number
    speed: number
  }
}

export interface LevelDefinition {
  id: LevelId
  number: number
  name: string
  description: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  walls: Wall[]
  hazards: Hazard[]
  pickups: Array<Point & { id: string }>
  terminals: Array<Point & { id: string }>
  drones: Array<Point & { id: string }>
  extraction: Point
  missionSeconds: number
  droneSpeed: number
  droneDetectionRadius: number
  extractionSeconds: number
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 'power-outage',
    number: 1,
    name: 'Power Outage',
    description: 'Collect energy cells and learn the basic controls.',
    difficulty: 'EASY',
    walls: [
      { id: 'block-a', x: 270, y: 80, width: 34, height: 210 },
      { id: 'block-b', x: 495, y: 300, width: 34, height: 250 },
      { id: 'block-c', x: 730, y: 70, width: 34, height: 210 },
    ],
    hazards: [
      { id: 'surge-a', x: 620, y: 380, radius: 21, patrol: { axis: 'x', min: 585, max: 655, speed: 30 } },
      { id: 'surge-b', x: 405, y: 485, radius: 18, patrol: { axis: 'y', min: 450, max: 520, speed: 22 } },
    ],
    pickups: [
      { id: 'cell-a', x: 190, y: 190 },
      { id: 'cell-b', x: 365, y: 365 },
      { id: 'cell-c', x: 560, y: 150 },
      { id: 'cell-d', x: 660, y: 500 },
      { id: 'cell-e', x: 850, y: 390 },
    ],
    terminals: [
      { id: 'terminal-a', x: 360, y: 120 },
      { id: 'terminal-b', x: 850, y: 500 },
    ],
    drones: [],
    extraction: { x: 920, y: 570 },
    missionSeconds: 180,
    droneSpeed: 0,
    droneDetectionRadius: 0,
    extractionSeconds: 0,
  },
  {
    id: 'drone-invasion',
    number: 2,
    name: 'Drone Invasion',
    description: 'Avoid hostile drones, navigate obstacles, and coordinate with your team.',
    difficulty: 'MEDIUM',
    walls: [
      { id: 'maze-a', x: 190, y: 30, width: 34, height: 250 },
      { id: 'maze-b', x: 190, y: 360, width: 34, height: 240 },
      { id: 'maze-c', x: 360, y: 130, width: 34, height: 300 },
      { id: 'maze-d', x: 535, y: 0, width: 34, height: 220 },
      { id: 'maze-e', x: 535, y: 300, width: 34, height: 300 },
      { id: 'maze-f', x: 710, y: 100, width: 34, height: 290 },
      { id: 'maze-g', x: 855, y: 410, width: 34, height: 210 },
    ],
    hazards: [
      { id: 'surge-a', x: 285, y: 330, radius: 25, patrol: { axis: 'x', min: 245, max: 325, speed: 28 } },
      { id: 'surge-b', x: 640, y: 480, radius: 25, patrol: { axis: 'y', min: 430, max: 530, speed: 32 } },
      { id: 'surge-c', x: 450, y: 80, radius: 21, patrol: { axis: 'x', min: 420, max: 490, speed: 24 } },
      { id: 'surge-d', x: 800, y: 350, radius: 22, patrol: { axis: 'y', min: 300, max: 390, speed: 26 } },
    ],
    pickups: [
      { id: 'cell-a', x: 125, y: 310 },
      { id: 'cell-b', x: 295, y: 90 },
      { id: 'cell-c', x: 445, y: 500 },
      { id: 'cell-d', x: 620, y: 260 },
      { id: 'cell-e', x: 790, y: 500 },
      { id: 'cell-f', x: 910, y: 260 },
      { id: 'cell-g', x: 455, y: 80 },
      { id: 'cell-h', x: 780, y: 65 },
    ],
    terminals: [
      { id: 'terminal-a', x: 295, y: 500 },
      { id: 'terminal-b', x: 455, y: 270 },
      { id: 'terminal-c', x: 800, y: 570 },
    ],
    drones: [
      { id: 'drone-a', x: 300, y: 315 },
      { id: 'drone-b', x: 650, y: 265 },
      { id: 'drone-c', x: 800, y: 100 },
    ],
    extraction: { x: 920, y: 570 },
    missionSeconds: 165,
    droneSpeed: 52,
    droneDetectionRadius: 380,
    extractionSeconds: 0,
  },
  {
    id: 'final-extraction',
    number: 3,
    name: 'Final Extraction',
    description: 'Survive dangerous hazards, complete the final objectives, and reach extraction.',
    difficulty: 'HARD',
    walls: [
      { id: 'reactor-a', x: 230, y: 0, width: 42, height: 205 },
      { id: 'reactor-b', x: 230, y: 325, width: 42, height: 315 },
      { id: 'reactor-c', x: 420, y: 95, width: 42, height: 220 },
      { id: 'reactor-d', x: 420, y: 425, width: 42, height: 215 },
      { id: 'reactor-e', x: 610, y: 0, width: 42, height: 200 },
      { id: 'reactor-f', x: 610, y: 310, width: 42, height: 230 },
      { id: 'reactor-g', x: 785, y: 120, width: 42, height: 290 },
      { id: 'reactor-h', x: 785, y: 500, width: 42, height: 140 },
      { id: 'reactor-i', x: 320, y: 225, width: 92, height: 34 },
      { id: 'reactor-j', x: 510, y: 350, width: 92, height: 34 },
    ],
    hazards: [
      { id: 'surge-a', x: 330, y: 100, radius: 26, patrol: { axis: 'x', min: 295, max: 375, speed: 28 } },
      { id: 'surge-b', x: 500, y: 245, radius: 28, patrol: { axis: 'x', min: 475, max: 565, speed: 24 } },
      { id: 'surge-c', x: 700, y: 460, radius: 27, patrol: { axis: 'y', min: 430, max: 490, speed: 20 } },
      { id: 'surge-d', x: 890, y: 300, radius: 24, patrol: { axis: 'y', min: 265, max: 345, speed: 30 } },
      { id: 'surge-e', x: 140, y: 500, radius: 24, patrol: { axis: 'y', min: 450, max: 550, speed: 26 } },
      { id: 'surge-f', x: 700, y: 100, radius: 23, patrol: { axis: 'x', min: 665, max: 750, speed: 32 } },
      { id: 'surge-g', x: 140, y: 300, radius: 23, patrol: { axis: 'y', min: 260, max: 350, speed: 24 } },
    ],
    pickups: [
      { id: 'cell-a', x: 150, y: 220 },
      { id: 'cell-b', x: 330, y: 300 },
      { id: 'cell-c', x: 520, y: 110 },
      { id: 'cell-d', x: 700, y: 250 },
      { id: 'cell-e', x: 900, y: 470 },
      { id: 'cell-f', x: 330, y: 550 },
      { id: 'cell-g', x: 720, y: 570 },
      { id: 'cell-h', x: 110, y: 370 },
      { id: 'cell-i', x: 900, y: 80 },
      { id: 'cell-j', x: 520, y: 570 },
    ],
    terminals: [
      { id: 'terminal-a', x: 330, y: 165 },
      { id: 'terminal-b', x: 520, y: 285 },
      { id: 'terminal-c', x: 710, y: 115 },
      { id: 'terminal-d', x: 900, y: 550 },
    ],
    drones: [
      { id: 'drone-a', x: 330, y: 410 },
      { id: 'drone-b', x: 520, y: 220 },
      { id: 'drone-c', x: 700, y: 530 },
      { id: 'drone-d', x: 900, y: 210 },
    ],
    extraction: { x: 920, y: 570 },
    missionSeconds: 150,
    droneSpeed: 66,
    droneDetectionRadius: 470,
    extractionSeconds: 12,
  },
]

export function getLevel(levelId: LevelId): LevelDefinition {
  const level = LEVELS.find((entry) => entry.id === levelId)
  if (!level) throw new Error(`Unknown level: ${levelId}`)
  return level
}

export function isLevelId(value: unknown): value is LevelId {
  return typeof value === 'string' && LEVELS.some((level) => level.id === value)
}
