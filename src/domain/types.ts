export type Mode = 'sort' | 'master-chef' | 'conveyor-chaos' | 'stacked-orders' | 'match-drop' | 'color-match';
export type Slots3 = [string | null, string | null, string | null];
export type SlotIndex = 0 | 1 | 2;
export interface SlotAddress { trayId: string; slot: SlotIndex }

export interface Food {
  id: string;
  name: string;
  emoji: string;
  color: string;
  family: string;
}

export interface Piece { id: string; foodId: string }

export type Obstacle =
  | { kind: 'cover'; foodId: string; remaining: number }
  | { kind: 'ice'; remaining: number; neighbors?: string[] }
  | { kind: 'hot'; remaining: number; durationMs: number; remainingMs: number }
  | { kind: 'wood'; remaining: number; rewardCoins: number };

export interface TrayDefinition {
  id: string;
  slots: Slots3;
  layers: Slots3[];
  obstacle?: Obstacle;
}

export interface TrayState {
  id: string;
  slots: Slots3;
  queuedLayers: Slots3[];
  nextLayer: number;
  obstacle: Obstacle | null;
}

export interface OrderDefinition {
  id: string;
  customer: string;
  requirements: Record<string, number>;
  startsAfterGroups: number;
  durationMs: number;
  mandatory: boolean;
  rewardCoins: number;
}

export interface OrderState extends OrderDefinition {
  progress: Record<string, number>;
  remainingMs: number;
  status: 'waiting' | 'active' | 'completed' | 'expired';
}

export interface LevelDefinition {
  id: string;
  contentVersion: number;
  name: string;
  description: string;
  tutorial?: string;
  mode: Mode;
  modeName: string;
  columns: number;
  seed: number;
  timeLimitMs: number;
  rewardCoins: number;
  trays: TrayDefinition[];
  orders: OrderDefinition[];
}

export interface Snapshot {
  levelId: string;
  contentVersion: number;
  mode: Mode;
  pieces: Record<string, Piece>;
  trays: TrayState[];
  orders: OrderState[];
  cleared: string[];
  remainingMs: number;
  timeLimitMs: number;
  elapsedMs: number;
  groupsCleared: number;
  totalGroups: number;
  moves: number;
  bonusCoins: number;
  rngState: number;
  blocked: boolean;
  status: 'playing' | 'won' | 'lost';
  failure?: 'timeout' | 'order' | 'heat';
}

export interface GameState extends Snapshot {
  undo: Snapshot | null;
  replay: Command[];
}

export type BoosterId = 'collect' | 'shuffle' | 'time' | 'open';

export type MoveCommand = { type: 'move'; from: SlotAddress; to: SlotAddress };
export type Command =
  | MoveCommand
  | { type: 'tick'; ms: number }
  | { type: 'boost'; booster: BoosterId; trayId?: string }
  | { type: 'undo' };

export type GameEvent =
  | { type: 'PieceMoved'; from: SlotAddress; to: SlotAddress; pieceId: string }
  | { type: 'TripleCleared'; foodId: string; matchKey: string; pieceIds: string[]; trayId?: string; boosted: boolean }
  | { type: 'LayerRevealed'; trayId: string; layer: number }
  | { type: 'ObstacleChanged'; trayId: string; remaining: number }
  | { type: 'OrderChanged'; orderId: string; status: OrderState['status'] }
  | { type: 'ConveyorAdvanced'; trayId: string }
  | { type: 'BoosterUsed'; booster: BoosterId }
  | { type: 'Undone' }
  | { type: 'Won' }
  | { type: 'Lost'; failure: NonNullable<Snapshot['failure']> }
  | { type: 'Blocked' };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; events: []; error: string };
