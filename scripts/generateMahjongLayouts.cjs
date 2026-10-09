// Complete Generator for 100 Mahjong Designs across 20 difficulty levels
const fs = require('fs');
const path = require('path');

const DESIGN_NAMES = [
  // Level 1 (24-28 blocks) - Novice
  { id: 1, name: "Zen Garden Mini", theme: "Garden", blocks: 24, desc: "A serene, balanced beginner courtyard with a central stepping stone." },
  { id: 2, name: "Twin Peaks", theme: "Nature", blocks: 24, desc: "Two mini mountain spires connected by a low ridge." },
  { id: 3, name: "Small Cross", theme: "Sacred", blocks: 26, desc: "Four symmetrical arms pointing outward from a central altar." },
  { id: 4, name: "Pocket Turtle", theme: "Animal", blocks: 28, desc: "A miniature version of the classic Chinese Tortoise layout." },
  { id: 5, name: "Four Corners", theme: "Architecture", blocks: 28, desc: "Four corner outposts surrounding a small inner terrace." },

  // Level 2 (32-36 blocks) - Beginner I
  { id: 6, name: "Step Pyramid", theme: "Ancient", blocks: 32, desc: "A clean 3-tier stepped pyramid with ascending platforms." },
  { id: 7, name: "Crescent Moon", theme: "Cosmic", blocks: 32, desc: "An elegant curving arc with stacked focal tips." },
  { id: 8, name: "Little Fortress", theme: "Military", blocks: 34, desc: "Thick defensive outer walls sheltering an elevated command post." },
  { id: 9, name: "Bamboo Arch", theme: "Nature", blocks: 36, desc: "A graceful arched torii canopy reaching skyward." },
  { id: 10, name: "Stone Gateway", theme: "Architecture", blocks: 36, desc: "Dual monolithic pillars holding an ornamental header." },

  // Level 3 (40-44 blocks) - Beginner II
  { id: 11, name: "Diamond Court", theme: "Geometric", blocks: 40, desc: "A brilliant faceted diamond silhouette with multi-level crown." },
  { id: 12, name: "Butterfly Pavilion", theme: "Animal", blocks: 40, desc: "Delicate sweeping wings extending outwards from a slender thorax." },
  { id: 13, name: "Lotus Blossom", theme: "Floral", blocks: 42, desc: "Layers of blooming petals opening toward the light." },
  { id: 14, name: "Jade Bridge", theme: "Architecture", blocks: 44, desc: "A spanning arched walkway across a tranquil ornamental pond." },
  { id: 15, name: "Twin Pillars", theme: "Monument", blocks: 44, desc: "Two tall sentry towers rising on either flank." },

  // Level 4 (48-52 blocks) - Apprentice I
  { id: 16, name: "Dragon Head", theme: "Mythic", blocks: 48, desc: "The fierce horned visage of the imperial dragon." },
  { id: 17, name: "Imperial Gate", theme: "Empire", blocks: 48, desc: "Grand entrance to the forbidden palace grounds." },
  { id: 18, name: "Silver Falcon", theme: "Animal", blocks: 50, desc: "A raptor in mid-glide with layered feather pinions." },
  { id: 19, name: "Mountain Shrine", theme: "Sacred", blocks: 52, desc: "A sacred mountain pavilion perched among mist and cliffs." },
  { id: 20, name: "Ancient Hourglass", theme: "Time", blocks: 52, desc: "Symmetrical hourglass waist holding upper and lower chambers." },

  // Level 5 (56-60 blocks) - Apprentice II
  { id: 21, name: "Sunken Courtyard", theme: "Garden", blocks: 56, desc: "Terraced subterranean atrium with tiered walking balconies." },
  { id: 22, name: "Lucky Clover", theme: "Folk", blocks: 56, desc: "Four rounded clover leaves converging at a golden nexus." },
  { id: 23, name: "Taiji Yin-Yang", theme: "Philosophy", blocks: 58, desc: "Complementary swirl of light and dark cosmic forces." },
  { id: 24, name: "Four Winds Pavilion", theme: "Architecture", blocks: 60, desc: "Open-air pavilion oriented to the cardinal compass points." },
  { id: 25, name: "Windmill Bastion", theme: "Industrial", blocks: 60, desc: "Four rotating angled sails atop a fortified gearbox foundation." },

  // Level 6 (64-68 blocks) - Journeyman I
  { id: 26, name: "Flying Crane", theme: "Animal", blocks: 64, desc: "Majestic migratory crane soaring over misty pines." },
  { id: 27, name: "Golden Pagoda", theme: "Architecture", blocks: 64, desc: "Five-story tiered pagoda with upturned flared eaves." },
  { id: 28, name: "Castle Keep", theme: "Fortress", blocks: 66, desc: "Heavy medieval stronghold with crenelated ramparts." },
  { id: 29, name: "Emerald Maze", theme: "Labyrinth", blocks: 68, desc: "Intricate geometric corridor labyrinth." },
  { id: 30, name: "Shield & Sword", theme: "Warrior", blocks: 68, desc: "A heavy round shield flanked by an upright runic blade." },

  // Level 7 (72-76 blocks) - Journeyman II
  { id: 31, name: "Star Constellation", theme: "Cosmic", blocks: 72, desc: "Radiating celestial starburst with central pulsar core." },
  { id: 32, name: "Tiger Sanctuary", theme: "Animal", blocks: 72, desc: "Powerful crouching predator ready to spring forward." },
  { id: 33, name: "River Serpent", theme: "Mythic", blocks: 74, desc: "Sinewy water dragon undulating through rushing currents." },
  { id: 34, name: "Phoenix Crest", theme: "Mythic", blocks: 76, desc: "Immortal firebird flaring its radiant tail plumes." },
  { id: 35, name: "Citadel Bastion", theme: "Military", blocks: 76, desc: "Multi-layered defensive bastion guarding borderlands." },

  // Level 8 (80-84 blocks) - Adept I
  { id: 36, name: "Imperial Throne", theme: "Empire", blocks: 80, desc: "High-backed dragon throne flanked by gilded armrests." },
  { id: 37, name: "Serpentine Wall", theme: "Ancient", blocks: 80, desc: "Winding defensive great wall tracing mountain ridges." },
  { id: 38, name: "Spiral Vortex", theme: "Cosmic", blocks: 82, desc: "Rotating spiral arms drawing inward toward the eye." },
  { id: 39, name: "Double Fortress", theme: "Fortress", blocks: 84, desc: "Twin citadels connected by a reinforced curtain wall." },
  { id: 40, name: "Twin Dragons", theme: "Mythic", blocks: 84, desc: "Two celestial dragons spiraling around a flaming pearl." },

  // Level 9 (88-92 blocks) - Adept II
  { id: 41, name: "Grand Pavilion", theme: "Architecture", blocks: 88, desc: "Sprawling banquet hall with extensive gallery wings." },
  { id: 42, name: "Cloud Terrace", theme: "Nature", blocks: 88, desc: "Tiered agricultural platforms carved high into cloud peaks." },
  { id: 43, name: "Warrior's Crest", theme: "Warrior", blocks: 90, desc: "Horned samurai kabuto helmet with ornamental crest plate." },
  { id: 44, name: "Royal Court", theme: "Empire", blocks: 92, desc: "Formal imperial courtyard flanked by advisor galleries." },
  { id: 45, name: "Anchor Citadel", theme: "Maritime", blocks: 92, desc: "Heavy maritime anchor structure resting on stone docks." },

  // Level 10 (96-100 blocks) - Expert I
  { id: 46, name: "Centurion Wall", theme: "Military", blocks: 96, desc: "Thick monolithic roman shield wall with rear support arches." },
  { id: 47, name: "Sky Fortress", theme: "Fantasy", blocks: 96, desc: "Floating aerial dreadnought with wide propulsion wings." },
  { id: 48, name: "Sacred Bell Tower", theme: "Sacred", blocks: 98, desc: "Towering wooden belfry enclosing a colossal bronze temple bell." },
  { id: 49, name: "Imperial Seal", theme: "Empire", blocks: 100, desc: "Intricately carved jade seal depicting the mandate of heaven." },
  { id: 50, name: "Mountain Megalith", theme: "Nature", blocks: 100, desc: "Imposing granite cliffs topped by ancient stone pillars." },

  // Level 11 (102-108 blocks) - Expert II
  { id: 51, name: "Octagon Hall", theme: "Sacred", blocks: 104, desc: "Eight-sided temple of heaven aligned with cosmic energy." },
  { id: 52, name: "Thunder Bastion", theme: "Elemental", blocks: 104, desc: "Fortified spire designed to channel lightning strikes." },
  { id: 53, name: "Dragon Spine", theme: "Mythic", blocks: 106, desc: "Exposed vertebrae of an ancient colossal earth dragon." },
  { id: 54, name: "Celestial Gateway", theme: "Cosmic", blocks: 108, desc: "Portal frame connecting terrestrial earth to higher heavens." },
  { id: 55, name: "Diamond Citadel", theme: "Fortress", blocks: 108, desc: "Impenetrable multifaceted crystalline fortress." },

  // Level 12 (110-116 blocks) - Master I
  { id: 56, name: "Dragon's Maw", theme: "Mythic", blocks: 112, desc: "Gaping jaws of the leviathan lined with jagged teeth." },
  { id: 57, name: "Golden Ziggurat", theme: "Ancient", blocks: 112, desc: "Mesopotamian stepped temple rising toward the sun god." },
  { id: 58, name: "Imperial Fortress", theme: "Empire", blocks: 114, desc: "Royal army headquarters with multiple fortified ring bastions." },
  { id: 59, name: "Radiant Starburst", theme: "Cosmic", blocks: 116, desc: "Multi-layered supernova explosion of geometric light." },
  { id: 60, name: "Guardian Sphinx", theme: "Mythic", blocks: 116, desc: "Colossal couchant beast keeping vigil over ancient royal tombs." },

  // Level 13 (118-124 blocks) - Master II
  { id: 61, name: "Great Colosseum", theme: "Ancient", blocks: 120, desc: "Elliptical gladiatorial arena with tiered spectator seating." },
  { id: 62, name: "Crown Jewel", theme: "Royal", blocks: 120, desc: "Royal coronation diadem encrusted with multi-tier gems." },
  { id: 63, name: "Sun God Temple", theme: "Sacred", blocks: 122, desc: "Radiating solar temple with concentric sunbeam galleries." },
  { id: 64, name: "Titan's Stairway", theme: "Mythic", blocks: 124, desc: "Massive steps carved for ancient giants into the mountainside." },
  { id: 65, name: "Obsidian Tower", theme: "Fantasy", blocks: 124, desc: "Volcanic glass dark wizard keep towering over desolate crags." },

  // Level 14 (126-132 blocks) - Grandmaster I
  { id: 66, name: "Ancient Ziggurat", theme: "Ancient", blocks: 128, desc: "Terraced pyramid structure with central monumental ramps." },
  { id: 67, name: "Leviathan Trench", theme: "Maritime", blocks: 128, desc: "Abyssal underwater canyon flanked by colossal coral shelves." },
  { id: 68, name: "Grand Archon", theme: "Mythic", blocks: 130, desc: "Robed divine sovereign seated upon a celestial rostrum." },
  { id: 69, name: "Eternal Lotus", theme: "Floral", blocks: 132, desc: "Full bloom sacred water lily with layered inner sanctums." },
  { id: 70, name: "Storm Keep", theme: "Elemental", blocks: 132, desc: "Perched cliff-edge castle constantly shrouded in lightning storms." },

  // Level 15 (134-140 blocks) - Grandmaster II
  { id: 71, name: "Imperial Dragon", theme: "Mythic", blocks: 136, desc: "Coiled five-clawed celestial dragon spanning the entire board." },
  { id: 72, name: "Olympus Citadel", theme: "Mythic", blocks: 136, desc: "Pantheon temple of the gods atop sacred Mount Olympus." },
  { id: 73, name: "Nebula Ring", theme: "Cosmic", blocks: 138, desc: "Concentric interstellar gas rings surrounding a dying stellar core." },
  { id: 74, name: "Sovereign Fortress", theme: "Fortress", blocks: 140, desc: "Triple-moated continental stronghold of the supreme warlord." },
  { id: 75, name: "Phoenix Ascendant", theme: "Mythic", blocks: 140, desc: "Resurrected firebird spreading colossal wings across the sky." },

  // Level 16 (142-148 blocks) - Champion I
  { id: 76, name: "Titan Citadel", theme: "Mythic", blocks: 144, desc: "Colossal mechanical city built on the shoulders of sleeping titans." },
  { id: 77, name: "Golden Colossus", theme: "Monument", blocks: 144, desc: "Towering bronze guardian spanning the entrance of the harbor." },
  { id: 78, name: "Valhalla Gate", theme: "Mythic", blocks: 146, desc: "Massive hall of fallen warriors lined with golden spears." },
  { id: 79, name: "Infinite Labyrinth", theme: "Labyrinth", blocks: 148, desc: "Mind-bending concentric maze with multi-tier optical dead ends." },
  { id: 80, name: "Celestial Palace", theme: "Empire", blocks: 148, desc: "Jade Emperor's floating palace amidst purple heavenly clouds." },

  // Level 17 (150-156 blocks) - Champion II
  { id: 81, name: "Apex Pyramid", theme: "Ancient", blocks: 152, desc: "The ultimate 5-layer monument reaching toward the apex star." },
  { id: 82, name: "Dragon Empress", theme: "Mythic", blocks: 152, desc: "Crowned dragon matriarch guarding her hoard of celestial pearls." },
  { id: 83, name: "Grand Monolith", theme: "Monument", blocks: 154, desc: "Stupendous primordial stone slab covered in forgotten runes." },
  { id: 84, name: "Galaxy Vortex", theme: "Cosmic", blocks: 156, desc: "Grand barred spiral galaxy spinning billions of solar systems." },
  { id: 85, name: "Bastion of Solitude", theme: "Fantasy", blocks: 156, desc: "Glacial ice stronghold fortified at the edge of the known world." },

  // Level 18 (158-164 blocks) - Legendary
  { id: 86, name: "Cosmic Wheel", theme: "Cosmic", blocks: 160, desc: "Eight-spoked wheel of life turning across deep universal time." },
  { id: 87, name: "Megastructure Ziggurat", theme: "Futuristic", blocks: 160, desc: "Arcology hive pyramid capable of housing a whole civilization." },
  { id: 88, name: "Leviathan Behemoth", theme: "Mythic", blocks: 162, desc: "Deep sea titan emerging from uncharted oceanic trenches." },
  { id: 89, name: "Imperial Dominion", theme: "Empire", blocks: 164, desc: "Grand multi-wing complex representing the supreme dynasty." },
  { id: 90, name: "Emperor's Redoubt", theme: "Fortress", blocks: 164, desc: "Impenetrable inner sanctum built from unbreakable basalt blocks." },

  // Level 19 (168-172 blocks) - Mythic Dynasty
  { id: 91, name: "Primordial Titan", theme: "Mythic", blocks: 168, desc: "Ancient world-shaper waking from eons of deep slumber." },
  { id: 92, name: "Dragon Sovereign", theme: "Mythic", blocks: 168, desc: "Supreme ruler of all dragons with sweeping nine-tiered wings." },
  { id: 93, name: "Astral Colossus", theme: "Cosmic", blocks: 170, desc: "Constellation guardian woven from living cosmic starlight." },
  { id: 94, name: "Celestial Spire", theme: "Sacred", blocks: 172, desc: "Heavenly needle connecting the mortal realm to the astral plain." },
  { id: 95, name: "Dynasty Fortress", theme: "Empire", blocks: 172, desc: "Colossal multi-courtyard citadel of five generations of emperors." },

  // Level 20 (176-184 blocks) - Celestial Dynasty
  { id: 96, name: "Grandmaster Matrix", theme: "Master", blocks: 176, desc: "Intricate interlocking high-density grid testing ultimate mastery." },
  { id: 97, name: "The 100-Dragon Megalith", theme: "Mythic", blocks: 178, desc: "Honoring the legendary hundred dragons in stone and jade." },
  { id: 98, name: "Imperial Supreme Pyramid", theme: "Ancient", blocks: 180, desc: "Six-tier golden monumental pyramid of divine ascension." },
  { id: 99, name: "Celestial Labyrinth Supreme", theme: "Labyrinth", blocks: 182, desc: "Supreme multi-dimensional maze of the heavenly spirits." },
  { id: 100, name: "The Ultimate Mahjong Dynasty", theme: "Dynasty", blocks: 184, desc: "The grandest Mahjong architectural layout ever assembled: 184 blocks across 6 vertical layers." }
];

// Difficulty titles
const LEVEL_TITLES = [
  "", // 0 index
  "Novice", "Beginner I", "Beginner II", "Apprentice I", "Apprentice II",
  "Journeyman I", "Journeyman II", "Adept I", "Adept II", "Expert I",
  "Expert II", "Master I", "Master II", "Grandmaster I", "Grandmaster II",
  "Champion I", "Champion II", "Legendary", "Mythic Dynasty", "Celestial Dynasty"
];

// Pattern generator functions based on shape family
function buildLayout(item) {
  const targetCount = item.blocks;
  const positions = [];
  const posSet = new Set();

  const addTile = (x, y, z) => {
    // Round to 2 decimal places
    const rx = Math.round(x * 2) / 2;
    const ry = Math.round(y * 2) / 2;
    const key = `${rx},${ry},${z}`;
    if (!posSet.has(key)) {
      posSet.add(key);
      positions.push({ x: rx, y: ry, z });
      return true;
    }
    return false;
  };

  const addSymmetric = (x, y, z) => {
    let added = 0;
    if (x === 0) {
      if (addTile(0, y, z)) added++;
    } else {
      if (addTile(x, y, z)) added++;
      if (addTile(-x, y, z)) added++;
    }
    return added;
  };

  const addFourSymmetric = (x, y, z) => {
    let added = 0;
    const xs = x === 0 ? [0] : [x, -x];
    const ys = y === 0 ? [0] : [y, -y];
    for (const px of xs) {
      for (const py of ys) {
        if (addTile(px, py, z)) added++;
      }
    }
    return added;
  };

  // Generate candidate coordinate pool according to design theme & id
  const shapeType = item.id % 6; // 0 to 5 shape variants

  // Layer allocation strategy:
  // For lower levels (24-40 tiles): z = 0, 1, 2
  // For mid levels (42-100 tiles): z = 0, 1, 2, 3
  // For high levels (102-184 tiles): z = 0, 1, 2, 3, 4, 5
  const maxZ = targetCount > 160 ? 5 : targetCount > 110 ? 4 : targetCount > 60 ? 3 : 2;

  // Let's create layered patterns systematically:
  // Step 1: Base ground layer (z = 0) ~60% of tiles
  // Step 2: Mid layer (z = 1) ~25% of tiles
  // Step 3: Upper layers (z = 2, 3, 4, 5) ~15% of tiles

  // Generate structural shapes based on shapeType
  const baseCandidates = [];

  // Determine grid envelope based on targetCount
  const widthRadius = Math.min(8, Math.max(3, Math.floor(Math.sqrt(targetCount) * 0.75)));
  const heightRadius = Math.min(6, Math.max(2, Math.floor(Math.sqrt(targetCount) * 0.55)));

  for (let z = 0; z <= maxZ; z++) {
    const layerShrink = z * 0.9;
    const wr = Math.max(1, widthRadius - layerShrink);
    const hr = Math.max(1, heightRadius - layerShrink);

    for (let dy = 0; dy <= hr; dy++) {
      for (let dx = 0; dx <= wr; dx++) {
        let include = false;

        if (shapeType === 0) {
          // Pyramid / Mountain / Citadel: Manhattan distance / diamond diamond-square
          const dist = (dx / wr) + (dy / hr);
          if (dist <= 1.25) include = true;
        } else if (shapeType === 1) {
          // Cross / Wings / Gateway: Arms and core
          if (dx <= 1.5 || dy <= 1.5 || (dx <= wr && dy <= 1.5) || (Math.abs(dx - dy) < 1.5)) include = true;
        } else if (shapeType === 2) {
          // Oval / Ring / Arena / Wheel: Elliptical shell + core
          const ellipse = (dx * dx) / (wr * wr + 0.1) + (dy * dy) / (hr * hr + 0.1);
          if (ellipse <= 1.15 && (z === 0 || ellipse <= 0.75)) include = true;
        } else if (shapeType === 3) {
          // Columns / Twin Towers / Gate: Pillars on left and right + center bridge
          if (dx >= wr * 0.4 || dy === 0 || (z > 0 && dx <= 2)) include = true;
        } else if (shapeType === 4) {
          // Labyrinth / Terraces: Stepped bands
          if ((dx + dy + z) % 2 === 0 || (dx <= 2 && dy <= 2)) include = true;
        } else {
          // Matrix / Bastion / Imperial: Dense stepped block
          if (dx <= wr && dy <= hr && (dx * dy <= wr * hr * 0.85)) include = true;
        }

        if (include) {
          // Priority score: lower z first, closer to center for higher z
          const priority = z * 100 + (dx * dx + dy * dy);
          baseCandidates.push({ dx, dy, z, priority });
        }
      }
    }
  }

  // Sort candidates so we build ground layer first, then second layer, etc.
  baseCandidates.sort((a, b) => a.priority - b.priority);

  // Greedily fill symmetrical pairs/quads until targetCount is reached
  for (const c of baseCandidates) {
    if (positions.length >= targetCount) break;

    // Check how many tiles this symmetry would add
    let countToAdd = 0;
    if (c.dx === 0 && c.dy === 0) countToAdd = 1;
    else if (c.dx === 0 || c.dy === 0) countToAdd = 2;
    else countToAdd = 4;

    // We need total count to be exactly targetCount, and must always be even
    if (positions.length + countToAdd <= targetCount) {
      addFourSymmetric(c.dx, c.dy, c.z);
    }
  }

  // If we still need tiles, add remaining slots symmetrically
  let zFallback = 0;
  let fallbackRadius = 1;
  while (positions.length < targetCount) {
    const diff = targetCount - positions.length;
    let addedAny = false;

    for (let z = 0; z <= maxZ; z++) {
      for (let y = 0; y <= heightRadius + 2; y++) {
        for (let x = 1; x <= widthRadius + 2; x++) {
          if (positions.length + 2 <= targetCount) {
            const keyL = `${x},${y},${z}`;
            const keyR = `${-x},${y},${z}`;
            if (!posSet.has(keyL) && !posSet.has(keyR)) {
              addTile(x, y, z);
              addTile(-x, y, z);
              addedAny = true;
              if (positions.length >= targetCount) break;
            }
          }
        }
        if (positions.length >= targetCount) break;
      }
      if (positions.length >= targetCount) break;
    }

    if (!addedAny) {
      // Add top layer center pairs
      for (let extraZ = maxZ + 1; extraZ <= maxZ + 3; extraZ++) {
        if (positions.length + 2 <= targetCount) {
          addTile(0.5, 0, extraZ);
          addTile(-0.5, 0, extraZ);
        }
        if (positions.length >= targetCount) break;
      }
      break;
    }
  }

  // Final trim if any overflow (trim symmetrical pairs from end)
  while (positions.length > targetCount) {
    const p1 = positions.pop();
    posSet.delete(`${p1.x},${p1.y},${p1.z}`);
    if (positions.length > targetCount) {
      const p2 = positions.pop();
      posSet.delete(`${p2.x},${p2.y},${p2.z}`);
    }
  }

  // Normalize coordinates so minX = 0, minY = 0
  let minX = Infinity, minY = Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  for (const p of positions) {
    p.x = Math.round((p.x - minX) * 2) / 2;
    p.y = Math.round((p.y - minY) * 2) / 2;
  }

  // Sort by z (layer ascending), then y, then x for deterministic rendering
  positions.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

  return positions;
}

// Generate all 100 designs
const allDesigns = [];
for (const item of DESIGN_NAMES) {
  const difficultyLevel = Math.ceil(item.id / 5);
  const difficultyTitle = LEVEL_TITLES[difficultyLevel];
  const positions = buildLayout(item);

  if (positions.length !== item.blocks) {
    console.error(`Mismatch for Design #${item.id} ${item.name}: expected ${item.blocks}, got ${positions.length}`);
    process.exit(1);
  }

  allDesigns.push({
    id: item.id,
    name: item.name,
    difficulty: difficultyLevel,
    difficultyTitle,
    theme: item.theme,
    blockCount: positions.length,
    description: item.desc,
    positions
  });
}

console.log(`Successfully generated all ${allDesigns.length} Mahjong designs!`);
console.log(`Min blocks: ${allDesigns[0].blockCount} (Design #1)`);
console.log(`Max blocks: ${allDesigns[99].blockCount} (Design #100)`);

// Check monotonic increase across difficulties
for (let lvl = 1; lvl <= 20; lvl++) {
  const lvlDesigns = allDesigns.filter(d => d.difficulty === lvl);
  const minB = Math.min(...lvlDesigns.map(d => d.blockCount));
  const maxB = Math.max(...lvlDesigns.map(d => d.blockCount));
  console.log(`Level ${lvl.toString().padStart(2, ' ')} (${LEVEL_TITLES[lvl].padEnd(18, ' ')}): ${lvlDesigns.length} designs, blocks: ${minB} - ${maxB}`);
}

// Output to src/components/games/mahjong/allDesigns.ts
const tsContent = `// Generated 100 Mahjong Layout Designs across 20 Difficulty Levels
import { MahjongDesignDef } from './mahjongData';

export const ALL_MAHJONG_DESIGNS: MahjongDesignDef[] = ${JSON.stringify(allDesigns, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/components/games/mahjong/allDesigns.ts'), tsContent, 'utf8');
console.log("Successfully wrote src/components/games/mahjong/allDesigns.ts");
