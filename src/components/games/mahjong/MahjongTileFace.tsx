import React from 'react';

interface MahjongTileFaceProps {
  tileId: string;
  name?: string;
  category?: string;
  isFree?: boolean;
  width: number;
  height: number;
}

// Canonical colors for traditional Mahjong tiles
const BLUE = '#1d4ed8';
const GREEN = '#047857';
const RED = '#dc2626';

// Standard authentic Mahjong Dot pip
const DotPip: React.FC<{
  size: number;
  color: string;
  ringColor?: string;
}> = ({ size, color, ringColor = '#ffffff' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    className="shrink-0 overflow-visible"
    style={{ filter: 'drop-shadow(0 0.5px 1px rgba(0,0,0,0.2))' }}
  >
    <circle cx="10" cy="10" r="9" fill={color} />
    <circle cx="10" cy="10" r="7.2" fill={ringColor} opacity="0.95" />
    <circle cx="10" cy="10" r="5" fill={color} />
    <circle cx="10" cy="10" r="2.2" fill={ringColor} opacity="0.95" />
  </svg>
);

// 1 Dot: Traditional ornate floral wheel / solar medallion
const OrnateOneDot: React.FC<{ size: number }> = ({ size }) => {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className="shrink-0 overflow-visible"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
    >
      {/* Outer scalloped/notched green ring */}
      <circle cx="20" cy="20" r="19" fill={GREEN} />
      <circle cx="20" cy="20" r="16.8" fill="#ffffff" />
      <circle cx="20" cy="20" r="14.8" fill={BLUE} />
      <circle cx="20" cy="20" r="12" fill="#ffffff" />
      {/* Central sunburst crimson disc */}
      <circle cx="20" cy="20" r="9.5" fill={RED} />
      <circle cx="20" cy="20" r="7.2" fill="#ffffff" />
      <circle cx="20" cy="20" r="4.6" fill={RED} />
      <circle cx="20" cy="20" r="2" fill="#ffffff" />
      {/* Radial satellite pips */}
      {angles.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const cx = 20 + 13.4 * Math.cos(rad);
        const cy = 20 + 13.4 * Math.sin(rad);
        return <circle key={deg} cx={cx} cy={cy} r="1.3" fill={RED} />;
      })}
    </svg>
  );
};

// Standard authentic Mahjong Bamboo stick pip
const BambooStick: React.FC<{
  w: number;
  h: number;
  color?: string;
}> = ({ w, h, color = GREEN }) => {
  const jointColor = color === GREEN ? '#065f46' : '#991b1b';
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 10 26"
      className="shrink-0 overflow-visible"
      style={{ filter: 'drop-shadow(0 0.5px 1px rgba(0,0,0,0.2))' }}
    >
      {/* Top segment */}
      <rect x="2" y="1" width="6" height="11" rx="2.5" fill={color} />
      {/* Joint node */}
      <rect x="0.8" y="11" width="8.4" height="3.2" rx="1.6" fill={jointColor} />
      <rect x="2.5" y="11.8" width="5" height="1.6" rx="0.8" fill="#ffffff" opacity="0.65" />
      {/* Bottom segment */}
      <rect x="2" y="13.5" width="6" height="11" rx="2.5" fill={color} />
      {/* Sheen lines */}
      <line x1="3.5" y1="2.5" x2="3.5" y2="9.5" stroke="#ffffff" strokeWidth="0.9" strokeLinecap="round" opacity="0.5" />
      <line x1="3.5" y1="15" x2="3.5" y2="22" stroke="#ffffff" strokeWidth="0.9" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
};

// 1 Bamboo: Prominent stylized single bamboo stalk
const LargeOneBamboo: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <svg
    width={w}
    height={h}
    viewBox="0 0 16 36"
    className="shrink-0 overflow-visible"
    style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
  >
    {/* Top node cap */}
    <rect x="3" y="2" width="10" height="9" rx="3" fill={GREEN} />
    <rect x="1.5" y="10" width="13" height="3" rx="1.5" fill="#065f46" />
    <rect x="3" y="10.8" width="10" height="1.4" rx="0.7" fill="#ffffff" opacity="0.6" />
    {/* Middle segment */}
    <rect x="3" y="12.5" width="10" height="10" rx="2" fill={GREEN} />
    <rect x="1.5" y="21.5" width="13" height="3" rx="1.5" fill="#065f46" />
    <rect x="3" y="22.3" width="10" height="1.4" rx="0.7" fill="#ffffff" opacity="0.6" />
    {/* Bottom segment */}
    <rect x="3" y="24" width="10" height="9" rx="3" fill={GREEN} />
    {/* Highlights */}
    <line x1="5" y1="4" x2="5" y2="9" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
    <line x1="5" y1="14" x2="5" y2="20" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
    <line x1="5" y1="26" x2="5" y2="31" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
  </svg>
);

export const MahjongTileFace: React.FC<MahjongTileFaceProps> = ({
  tileId,
  isFree = true,
  width,
  height,
}) => {
  // Normalize tile identifier
  const cleanId = (tileId || '').toLowerCase().trim();

  // Determine standard tile key: d1-d9, b1-b9, we, ws
  let standardKey = cleanId;
  if (cleanId === '🀙' || cleanId === 'circle1') standardKey = 'd1';
  else if (cleanId === '🀚' || cleanId === 'circle2') standardKey = 'd2';
  else if (cleanId === '🀛' || cleanId === 'circle3') standardKey = 'd3';
  else if (cleanId === '🀜' || cleanId === 'circle4') standardKey = 'd4';
  else if (cleanId === '🀝' || cleanId === 'circle5') standardKey = 'd5';
  else if (cleanId === '🀞' || cleanId === 'circle6') standardKey = 'd6';
  else if (cleanId === '🀟' || cleanId === 'circle7') standardKey = 'd7';
  else if (cleanId === '🀠' || cleanId === 'circle8') standardKey = 'd8';
  else if (cleanId === '🀡' || cleanId === 'circle9') standardKey = 'd9';
  else if (cleanId === '🀐' || cleanId === 'bamboo1') standardKey = 'b1';
  else if (cleanId === '🀑' || cleanId === 'bamboo2') standardKey = 'b2';
  else if (cleanId === '🀒' || cleanId === 'bamboo3') standardKey = 'b3';
  else if (cleanId === '🀓' || cleanId === 'bamboo4') standardKey = 'b4';
  else if (cleanId === '🀔' || cleanId === 'bamboo5') standardKey = 'b5';
  else if (cleanId === '🀕' || cleanId === 'bamboo6') standardKey = 'b6';
  else if (cleanId === '🀖' || cleanId === 'bamboo7') standardKey = 'b7';
  else if (cleanId === '🀗' || cleanId === 'bamboo8') standardKey = 'b8';
  else if (cleanId === '🀘' || cleanId === 'bamboo9') standardKey = 'b9';
  else if (cleanId === '🀀' || cleanId === 'east') standardKey = 'we';
  else if (cleanId === '🀁' || cleanId === 'south') standardKey = 'ws';

  // Base sizing calculations
  const faceW = Math.max(22, width - 6);
  const faceH = Math.max(28, height - 8);

  // Scaled dimensions for pips
  const dotSize = Math.max(6, Math.min(13, Math.floor(faceW * 0.28)));
  const smallDotSize = Math.max(5, Math.min(11, Math.floor(faceW * 0.23)));
  const largeOneDotSize = Math.max(16, Math.min(36, Math.floor(faceW * 0.72)));

  const stickW = Math.max(4, Math.min(8, Math.floor(faceW * 0.16)));
  const stickH = Math.max(10, Math.min(22, Math.floor(faceH * 0.36)));
  const oneStickW = Math.max(8, Math.min(14, Math.floor(faceW * 0.32)));
  const oneStickH = Math.max(20, Math.min(42, Math.floor(faceH * 0.68)));

  // Render tile artwork
  const renderTileContent = () => {
    switch (standardKey) {
      // ==================== DOTS 1 - 9 ====================
      case 'd1':
        return <OrnateOneDot size={largeOneDotSize} />;

      case 'd2':
        return (
          <div className="flex flex-col items-center justify-between" style={{ height: `${faceH * 0.68}px` }}>
            <DotPip size={dotSize} color={GREEN} />
            <DotPip size={dotSize} color={BLUE} />
          </div>
        );

      case 'd3':
        return (
          <div className="relative" style={{ width: `${faceW * 0.72}px`, height: `${faceH * 0.68}px` }}>
            <div className="absolute top-0 left-0">
              <DotPip size={dotSize} color={BLUE} />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <DotPip size={dotSize} color={RED} />
            </div>
            <div className="absolute bottom-0 right-0">
              <DotPip size={dotSize} color={GREEN} />
            </div>
          </div>
        );

      case 'd4':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.68}px`, height: `${faceH * 0.66}px` }}>
            <div className="flex justify-between">
              <DotPip size={dotSize} color={BLUE} />
              <DotPip size={dotSize} color={GREEN} />
            </div>
            <div className="flex justify-between">
              <DotPip size={dotSize} color={GREEN} />
              <DotPip size={dotSize} color={BLUE} />
            </div>
          </div>
        );

      case 'd5':
        return (
          <div className="relative" style={{ width: `${faceW * 0.74}px`, height: `${faceH * 0.7}px` }}>
            <div className="absolute top-0 left-0">
              <DotPip size={smallDotSize} color={BLUE} />
            </div>
            <div className="absolute top-0 right-0">
              <DotPip size={smallDotSize} color={GREEN} />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <DotPip size={smallDotSize} color={RED} />
            </div>
            <div className="absolute bottom-0 left-0">
              <DotPip size={smallDotSize} color={GREEN} />
            </div>
            <div className="absolute bottom-0 right-0">
              <DotPip size={smallDotSize} color={BLUE} />
            </div>
          </div>
        );

      case 'd6':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.66}px`, height: `${faceH * 0.76}px` }}>
            {/* Top row: 2 green dots */}
            <div className="flex justify-between">
              <DotPip size={smallDotSize} color={GREEN} />
              <DotPip size={smallDotSize} color={GREEN} />
            </div>
            {/* Middle row: 2 red dots */}
            <div className="flex justify-between">
              <DotPip size={smallDotSize} color={RED} />
              <DotPip size={smallDotSize} color={RED} />
            </div>
            {/* Bottom row: 2 red dots */}
            <div className="flex justify-between">
              <DotPip size={smallDotSize} color={RED} />
              <DotPip size={smallDotSize} color={RED} />
            </div>
          </div>
        );

      case 'd7':
        return (
          <div className="flex flex-col items-center justify-between" style={{ width: `${faceW * 0.74}px`, height: `${faceH * 0.8}px` }}>
            {/* Top 3 dots in slant */}
            <div className="relative w-full" style={{ height: `${faceH * 0.32}px` }}>
              <div className="absolute top-0 left-0">
                <DotPip size={smallDotSize} color={GREEN} />
              </div>
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2">
                <DotPip size={smallDotSize} color={GREEN} />
              </div>
              <div className="absolute bottom-0 right-0">
                <DotPip size={smallDotSize} color={GREEN} />
              </div>
            </div>
            {/* Bottom 4 red dots in 2x2 square */}
            <div className="flex flex-col justify-between w-full px-1" style={{ height: `${faceH * 0.38}px` }}>
              <div className="flex justify-between">
                <DotPip size={smallDotSize} color={RED} />
                <DotPip size={smallDotSize} color={RED} />
              </div>
              <div className="flex justify-between">
                <DotPip size={smallDotSize} color={RED} />
                <DotPip size={smallDotSize} color={RED} />
              </div>
            </div>
          </div>
        );

      case 'd8':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.64}px`, height: `${faceH * 0.82}px` }}>
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className="flex justify-between">
                <DotPip size={smallDotSize} color={BLUE} />
                <DotPip size={smallDotSize} color={BLUE} />
              </div>
            ))}
          </div>
        );

      case 'd9':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.82}px`, height: `${faceH * 0.78}px` }}>
            {/* Top row: 3 blue */}
            <div className="flex justify-between">
              <DotPip size={smallDotSize} color={BLUE} />
              <DotPip size={smallDotSize} color={BLUE} />
              <DotPip size={smallDotSize} color={BLUE} />
            </div>
            {/* Middle row: 3 red */}
            <div className="flex justify-between">
              <DotPip size={smallDotSize} color={RED} />
              <DotPip size={smallDotSize} color={RED} />
              <DotPip size={smallDotSize} color={RED} />
            </div>
            {/* Bottom row: 3 green */}
            <div className="flex justify-between">
              <DotPip size={smallDotSize} color={GREEN} />
              <DotPip size={smallDotSize} color={GREEN} />
              <DotPip size={smallDotSize} color={GREEN} />
            </div>
          </div>
        );

      // ==================== BAMBOO 1 - 9 ====================
      case 'b1':
        return <LargeOneBamboo w={oneStickW} h={oneStickH} />;

      case 'b2':
        return (
          <div className="flex flex-col items-center justify-between" style={{ height: `${faceH * 0.75}px` }}>
            <BambooStick w={stickW} h={stickH} color={GREEN} />
            <BambooStick w={stickW} h={stickH} color={BLUE} />
          </div>
        );

      case 'b3':
        return (
          <div className="flex flex-col items-center justify-between" style={{ width: `${faceW * 0.62}px`, height: `${faceH * 0.75}px` }}>
            <BambooStick w={stickW} h={stickH} color={BLUE} />
            <div className="flex justify-between w-full">
              <BambooStick w={stickW} h={stickH} color={GREEN} />
              <BambooStick w={stickW} h={stickH} color={GREEN} />
            </div>
          </div>
        );

      case 'b4':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.6}px`, height: `${faceH * 0.74}px` }}>
            <div className="flex justify-between">
              <BambooStick w={stickW} h={stickH * 0.88} color={BLUE} />
              <BambooStick w={stickW} h={stickH * 0.88} color={GREEN} />
            </div>
            <div className="flex justify-between">
              <BambooStick w={stickW} h={stickH * 0.88} color={GREEN} />
              <BambooStick w={stickW} h={stickH * 0.88} color={BLUE} />
            </div>
          </div>
        );

      case 'b5':
        return (
          <div className="relative flex items-center justify-center" style={{ width: `${faceW * 0.7}px`, height: `${faceH * 0.75}px` }}>
            <div className="absolute top-0 left-0">
              <BambooStick w={stickW} h={stickH * 0.8} color={GREEN} />
            </div>
            <div className="absolute top-0 right-0">
              <BambooStick w={stickW} h={stickH * 0.8} color={BLUE} />
            </div>
            <div className="z-10">
              <BambooStick w={stickW} h={stickH * 0.85} color={RED} />
            </div>
            <div className="absolute bottom-0 left-0">
              <BambooStick w={stickW} h={stickH * 0.8} color={BLUE} />
            </div>
            <div className="absolute bottom-0 right-0">
              <BambooStick w={stickW} h={stickH * 0.8} color={GREEN} />
            </div>
          </div>
        );

      case 'b6':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.75}px`, height: `${faceH * 0.74}px` }}>
            <div className="flex justify-between">
              <BambooStick w={stickW} h={stickH * 0.88} color={GREEN} />
              <BambooStick w={stickW} h={stickH * 0.88} color={GREEN} />
              <BambooStick w={stickW} h={stickH * 0.88} color={GREEN} />
            </div>
            <div className="flex justify-between">
              <BambooStick w={stickW} h={stickH * 0.88} color={BLUE} />
              <BambooStick w={stickW} h={stickH * 0.88} color={BLUE} />
              <BambooStick w={stickW} h={stickH * 0.88} color={BLUE} />
            </div>
          </div>
        );

      case 'b7':
        return (
          <div className="flex flex-col items-center justify-between" style={{ width: `${faceW * 0.75}px`, height: `${faceH * 0.8}px` }}>
            <BambooStick w={stickW} h={stickH * 0.75} color={RED} />
            <div className="flex justify-between w-full">
              <BambooStick w={stickW} h={stickH * 0.75} color={GREEN} />
              <BambooStick w={stickW} h={stickH * 0.75} color={GREEN} />
              <BambooStick w={stickW} h={stickH * 0.75} color={GREEN} />
            </div>
            <div className="flex justify-between w-full">
              <BambooStick w={stickW} h={stickH * 0.75} color={BLUE} />
              <BambooStick w={stickW} h={stickH * 0.75} color={BLUE} />
              <BambooStick w={stickW} h={stickH * 0.75} color={BLUE} />
            </div>
          </div>
        );

      case 'b8':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.82}px`, height: `${faceH * 0.76}px` }}>
            <div className="flex justify-between">
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={GREEN} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={GREEN} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={BLUE} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={BLUE} />
            </div>
            <div className="flex justify-between">
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={BLUE} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={BLUE} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={GREEN} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.85} color={GREEN} />
            </div>
          </div>
        );

      case 'b9':
        return (
          <div className="flex flex-col justify-between" style={{ width: `${faceW * 0.78}px`, height: `${faceH * 0.82}px` }}>
            <div className="flex justify-between">
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={RED} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={BLUE} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={GREEN} />
            </div>
            <div className="flex justify-between">
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={BLUE} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={RED} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={GREEN} />
            </div>
            <div className="flex justify-between">
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={GREEN} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={GREEN} />
              <BambooStick w={stickW * 0.9} h={stickH * 0.75} color={RED} />
            </div>
          </div>
        );

      // ==================== WINDS (EAST & SOUTH) ====================
      case 'we':
        return (
          <div className="flex items-center justify-center">
            <span
              className="select-none leading-none tracking-tight font-black"
              style={{
                fontFamily: `'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', 'SimSun', serif`,
                fontSize: `${Math.round(faceH * 0.78)}px`,
                color: BLUE,
                textShadow: '0 1px 1px rgba(0,0,0,0.2)',
              }}
            >
              東
            </span>
          </div>
        );

      case 'ws':
        return (
          <div className="flex items-center justify-center">
            <span
              className="select-none leading-none tracking-tight font-black"
              style={{
                fontFamily: `'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', 'SimSun', serif`,
                fontSize: `${Math.round(faceH * 0.78)}px`,
                color: RED,
                textShadow: '0 1px 1px rgba(0,0,0,0.2)',
              }}
            >
              南
            </span>
          </div>
        );

      default:
        // Fallback for any other tile
        return (
          <span
            className="font-bold text-slate-800 leading-none select-none"
            style={{ fontSize: `${Math.round(faceH * 0.55)}px` }}
          >
            {cleanId}
          </span>
        );
    }
  };

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center relative pointer-events-none ${
        !isFree ? 'grayscale-70 opacity-60' : ''
      }`}
    >
      {renderTileContent()}
    </div>
  );
};
