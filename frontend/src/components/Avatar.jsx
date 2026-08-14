import React from 'react';

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PALETTE = [
  ['#2563eb', '#1e40af'],
  ['#10b981', '#065f46'],
  ['#f59e0b', '#92400e'],
  ['#ef4444', '#991b1b'],
  ['#8b5cf6', '#5b21b6'],
  ['#ec4899', '#9d174d'],
  ['#14b8a6', '#115e59'],
  ['#f97316', '#7c2d12'],
];

function Identicon({ name, size }) {
  const hash = hashString(name);
  const [fg, bg] = PALETTE[hash % PALETTE.length];
  const cell = size / 5;
  const cells = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = (hash >> ((row * 5 + col) % 31)) & 1;
      if (bit) {
        cells.push(`${col * cell},${row * cell}`);
        if (col !== 2) cells.push(`${(4 - col) * cell},${row * cell}`);
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius: '50%', flexShrink: 0 }}>
      <rect width={size} height={size} fill={bg} />
      {cells.map((c, i) => {
        const [x, y] = c.split(',');
        return <rect key={i} x={x} y={y} width={cell} height={cell} fill={fg} />;
      })}
    </svg>
  );
}

export default function Avatar({ name, size = 40 }) {
  if (name) {
    return <Identicon name={String(name).trim() || '?'} size={size} />;
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#2563eb',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.4,
        flexShrink: 0
      }}
    >
      ?
    </div>
  );
}
