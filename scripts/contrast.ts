// scripts/contrast.ts
// Calculates WCAG 2.1 relative luminance and contrast ratio for all text & focus ring pairings.

interface Color {
  name: string;
  hex: string;
  role: 'background' | 'text' | 'focus-ring' | 'accent' | 'boundary';
}

const COLORS: Color[] = [
  { name: 'Base Background (--bg)', hex: '#1B1E26', role: 'background' },
  { name: 'Raised Surface Gradient Light', hex: '#1E222B', role: 'background' },
  { name: 'Raised Surface Gradient Dark', hex: '#181B22', role: 'background' },
  { name: 'Primary Text (--text)', hex: '#E8E6E1', role: 'text' },
  { name: 'Muted Text (--muted)', hex: '#9AA0AE', role: 'text' },
  { name: 'Speaker You Accent (--you)', hex: '#FF8A4C', role: 'text' },
  { name: 'Speaker Them Accent (--them)', hex: '#5BC0EB', role: 'text' },
  { name: 'Heat Low (--heat-lo)', hex: '#F2C14E', role: 'text' },
  { name: 'Heat High (--heat-hi)', hex: '#FF453A', role: 'text' },
  { name: 'Focus Ring You (--you)', hex: '#FF8A4C', role: 'focus-ring' },
  { name: 'Focus Ring Them (--them)', hex: '#5BC0EB', role: 'focus-ring' },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getLuminance([r, g, b]: [number, number, number]): number {
  const [sR, sG, sB] = [r, g, b].map((val) => {
    const c = val / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

function getContrast(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function runAudit() {
  console.log('='.repeat(80));
  console.log('  VOXERA NEUMORPHISM CONTRAST RATIO AUDIT (WCAG 2.1 AA)');
  console.log('='.repeat(80));
  console.log('Requirement: All text >= 4.5:1, All focus rings / boundaries >= 3.0:1\n');

  const bgColors = COLORS.filter((c) => c.role === 'background');
  const textColors = COLORS.filter((c) => c.role === 'text');
  const focusColors = COLORS.filter((c) => c.role === 'focus-ring');

  let totalChecks = 0;
  let passCount = 0;
  let failCount = 0;

  console.log('--- TEXT CONTRAST PAIRINGS (Target: >= 4.5:1) ---');
  for (const bg of bgColors) {
    console.log(`\nSurface: ${bg.name} (${bg.hex})`);
    for (const text of textColors) {
      totalChecks++;
      const ratio = getContrast(text.hex, bg.hex);
      const passed = ratio >= 4.5;
      if (passed) passCount++;
      else failCount++;
      const status = passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} | ${text.name.padEnd(30)} ${text.hex} : ${ratio.toFixed(2)}:1`);
    }
  }

  console.log('\n--- FOCUS RING & NON-TEXT BOUNDARIES (Target: >= 3.0:1) ---');
  for (const bg of bgColors) {
    console.log(`\nSurface: ${bg.name} (${bg.hex})`);
    for (const ring of focusColors) {
      totalChecks++;
      const ratio = getContrast(ring.hex, bg.hex);
      const passed = ratio >= 3.0;
      if (passed) passCount++;
      else failCount++;
      const status = passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} | ${ring.name.padEnd(30)} ${ring.hex} : ${ratio.toFixed(2)}:1`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Total checks: ${totalChecks} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('='.repeat(80));

  if (failCount > 0) {
    process.exit(1);
  }
}

runAudit();
