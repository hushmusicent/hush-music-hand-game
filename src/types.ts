export type ViewType = 'home' | 'friends' | 'leaderboard' | 'profile';

export type GameId =
  | 'slots'
  | 'blackjack'
  | 'roulette'
  | 'craps'
  | 'poker'
  | 'checkers'
  | 'chess'
  | 'dominoes'
  | 'spades'
  | 'rummy'
  | 'backgammon'
  | 'mahjong';

export interface User {
  uid: string;
  username: string;
  email: string;
  points: number;
  wins: Record<string, number>;
  lastDaily: number;
  avatar?: string;
  password?: string;
}

export interface Room {
  code: string;
  game: GameId;
  seatsNeeded: number;
  seats: string[];
  names: Record<string, string>;
  avatars?: Record<string, string>;
  state: any;
  turn: number;
  status: 'waiting' | 'playing' | 'done';
  host: string;
  created: number;
  updatedAt?: number;
  lastUpdated?: number;
}

export interface ChatMessage {
  id: string;
  who: string;
  uid: string;
  text: string;
  at: number;
  avatar?: string;
}

export interface Friend {
  uid: string;
  username: string;
  online: boolean;
  avatar?: string;
}

export interface FriendRequest {
  uid: string;
  from: string;
  at: number;
  avatar?: string;
}

export interface Card {
  r: string;
  s: '♠' | '♥' | '♦' | '♣';
}

export interface GameInstructions {
  overview: string;
  objective: string;
  howToPlay: string[];
  rules: string[];
  scoring: string[];
  proTips: string[];
}

export interface GameMetadata {
  id: GameId;
  name: string;
  icon: string;
  tags: string;
  pvp: boolean;
  seats: number;
  description: string;
  category: 'Casino' | 'Board' | 'Cards' | 'Puzzle';
  instructions?: GameInstructions;
}
