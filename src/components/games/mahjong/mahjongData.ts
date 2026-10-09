export interface RawTilePos {
  x: number;
  y: number;
  z: number;
}

export interface MahjongDesignDef {
  id: number;
  name: string;
  difficulty: number; // 1 to 20
  difficultyTitle: string;
  theme: string;
  blockCount: number;
  description: string;
  positions: RawTilePos[];
}

export interface DifficultyTier {
  level: number;
  title: string;
  minBlocks: number;
  maxBlocks: number;
  designIds: number[];
  color: string;
}

// 20 Difficulty Tiers
export const DIFFICULTY_TIERS: DifficultyTier[] = [
  { level: 1, title: 'Novice', minBlocks: 24, maxBlocks: 28, designIds: [1, 2, 3, 4, 5], color: 'emerald' },
  { level: 2, title: 'Beginner I', minBlocks: 32, maxBlocks: 36, designIds: [6, 7, 8, 9, 10], color: 'emerald' },
  { level: 3, title: 'Beginner II', minBlocks: 40, maxBlocks: 44, designIds: [11, 12, 13, 14, 15], color: 'teal' },
  { level: 4, title: 'Apprentice I', minBlocks: 48, maxBlocks: 52, designIds: [16, 17, 18, 19, 20], color: 'teal' },
  { level: 5, title: 'Apprentice II', minBlocks: 56, maxBlocks: 60, designIds: [21, 22, 23, 24, 25], color: 'cyan' },
  { level: 6, title: 'Journeyman I', minBlocks: 64, maxBlocks: 68, designIds: [26, 27, 28, 29, 30], color: 'cyan' },
  { level: 7, title: 'Journeyman II', minBlocks: 72, maxBlocks: 76, designIds: [31, 32, 33, 34, 35], color: 'sky' },
  { level: 8, title: 'Adept I', minBlocks: 80, maxBlocks: 84, designIds: [36, 37, 38, 39, 40], color: 'sky' },
  { level: 9, title: 'Adept II', minBlocks: 88, maxBlocks: 92, designIds: [41, 42, 43, 44, 45], color: 'blue' },
  { level: 10, title: 'Expert I', minBlocks: 96, maxBlocks: 100, designIds: [46, 47, 48, 49, 50], color: 'blue' },
  { level: 11, title: 'Expert II', minBlocks: 104, maxBlocks: 108, designIds: [51, 52, 53, 54, 55], color: 'indigo' },
  { level: 12, title: 'Master I', minBlocks: 112, maxBlocks: 116, designIds: [56, 57, 58, 59, 60], color: 'indigo' },
  { level: 13, title: 'Master II', minBlocks: 120, maxBlocks: 124, designIds: [61, 62, 63, 64, 65], color: 'violet' },
  { level: 14, title: 'Grandmaster I', minBlocks: 128, maxBlocks: 132, designIds: [66, 67, 68, 69, 70], color: 'violet' },
  { level: 15, title: 'Grandmaster II', minBlocks: 136, maxBlocks: 140, designIds: [71, 72, 73, 74, 75], color: 'purple' },
  { level: 16, title: 'Champion I', minBlocks: 144, maxBlocks: 148, designIds: [76, 77, 78, 79, 80], color: 'purple' },
  { level: 17, title: 'Champion II', minBlocks: 152, maxBlocks: 156, designIds: [81, 82, 83, 84, 85], color: 'fuchsia' },
  { level: 18, title: 'Legendary', minBlocks: 160, maxBlocks: 164, designIds: [86, 87, 88, 89, 90], color: 'pink' },
  { level: 19, title: 'Mythic Dynasty', minBlocks: 168, maxBlocks: 172, designIds: [91, 92, 93, 94, 95], color: 'rose' },
  { level: 20, title: 'Celestial Dynasty', minBlocks: 176, maxBlocks: 184, designIds: [96, 97, 98, 99, 100], color: 'amber' },
];

export const MAHJONG_TILES = [
  // Characters (Wan)
  { id: 'c1', symbol: '🀇', name: '1 Character', category: 'character', color: '#b91c1c' },
  { id: 'c2', symbol: '🀈', name: '2 Character', category: 'character', color: '#b91c1c' },
  { id: 'c3', symbol: '🀉', name: '3 Character', category: 'character', color: '#b91c1c' },
  { id: 'c4', symbol: '🀊', name: '4 Character', category: 'character', color: '#b91c1c' },
  { id: 'c5', symbol: '🀋', name: '5 Character', category: 'character', color: '#b91c1c' },
  { id: 'c6', symbol: '🀌', name: '6 Character', category: 'character', color: '#b91c1c' },
  { id: 'c7', symbol: '🀍', name: '7 Character', category: 'character', color: '#b91c1c' },
  { id: 'c8', symbol: '🀎', name: '8 Character', category: 'character', color: '#b91c1c' },
  { id: 'c9', symbol: '🀏', name: '9 Character', category: 'character', color: '#b91c1c' },
  // Bamboo (Tiao)
  { id: 'b1', symbol: '🀐', name: '1 Bamboo (Sparrow)', category: 'bamboo', color: '#047857' },
  { id: 'b2', symbol: '🀑', name: '2 Bamboo', category: 'bamboo', color: '#047857' },
  { id: 'b3', symbol: '🀒', name: '3 Bamboo', category: 'bamboo', color: '#047857' },
  { id: 'b4', symbol: '🀓', name: '4 Bamboo', category: 'bamboo', color: '#047857' },
  { id: 'b5', symbol: '🀔', name: '5 Bamboo', category: 'bamboo', color: '#047857' },
  { id: 'b6', symbol: '🀕', name: '6 Bamboo', category: 'bamboo', color: '#047857' },
  { id: 'b7', symbol: '🀖', name: '7 Bamboo', category: 'bamboo', color: '#047857' },
  { id: 'b8', symbol: '🀗', name: '8 Bamboo', category: 'bamboo', color: '#047857' },
  { id: 'b9', symbol: '🀘', name: '9 Bamboo', category: 'bamboo', color: '#047857' },
  // Circles / Dots (Tong)
  { id: 'd1', symbol: '🀙', name: '1 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd2', symbol: '🀚', name: '2 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd3', symbol: '🀛', name: '3 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd4', symbol: '🀜', name: '4 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd5', symbol: '🀝', name: '5 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd6', symbol: '🀞', name: '6 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd7', symbol: '🀟', name: '7 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd8', symbol: '🀠', name: '8 Circle', category: 'circle', color: '#1d4ed8' },
  { id: 'd9', symbol: '🀡', name: '9 Circle', category: 'circle', color: '#1d4ed8' },
  // Dragons
  { id: 'dr', symbol: '🀄', name: 'Red Dragon', category: 'dragon', color: '#dc2626' },
  { id: 'dg', symbol: '🀅', name: 'Green Dragon', category: 'dragon', color: '#16a34a' },
  { id: 'dw', symbol: '🀆', name: 'White Dragon', category: 'dragon', color: '#2563eb' },
  // Winds
  { id: 'we', symbol: '🀀', name: 'East Wind', category: 'wind', color: '#d97706' },
  { id: 'ws', symbol: '🀁', name: 'South Wind', category: 'wind', color: '#d97706' },
  { id: 'ww', symbol: '🀂', name: 'West Wind', category: 'wind', color: '#d97706' },
  { id: 'wn', symbol: '🀃', name: 'North Wind', category: 'wind', color: '#d97706' },
  // Seasons & Flowers
  { id: 'fl1', symbol: '🀢', name: 'Plum Blossom', category: 'flower', color: '#db2777' },
  { id: 'fl2', symbol: '🀣', name: 'Orchid', category: 'flower', color: '#db2777' },
  { id: 'fl3', symbol: '🀤', name: 'Bamboo Flower', category: 'flower', color: '#059669' },
  { id: 'fl4', symbol: '🀥', name: 'Chrysanthemum', category: 'flower', color: '#ca8a04' },
];
