export function generateMeshGradient(seed: string): string {
    // Simple hash function for deterministic results
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Predefined premium color palettes (Tailwind-ish hex codes)
    const palettes = [
        // [Primary, Secondary, Accent]
        ['#0f172a', '#1e293b', '#334155'], // Slate (Dark/Neutral)
        ['#18181b', '#27272a', '#3f3f46'], // Zinc (Darker)
        ['#0c4a6e', '#075985', '#0ea5e9'], // Sky (Blue)
        ['#020617', '#172554', '#1e40af'], // Indigo (Deep Blue)
        ['#4a044e', '#701a75', '#c026d3'], // Fuchsia (Purple)
        ['#134e4a', '#115e59', '#14b8a6'], // Teal
        ['#0f172a', '#312e81', '#4338ca'], // Indigo/Slate
        ['#fafafa', '#f4f4f5', '#e4e4e7'], // White/Zinc (Light - maybe avoid for dark mode) -> Replaced with Dark Teal
        ['#042f2e', '#134e4a', '#2dd4bf'], // Dark Teal
    ];

    const paletteIndex = Math.abs(hash) % palettes.length;
    const colors = palettes[paletteIndex];

    // Generate random positions (deterministic)
    const pos1 = Math.abs((hash >> 0) % 100);
    const pos2 = Math.abs((hash >> 4) % 100);
    const pos3 = Math.abs((hash >> 8) % 100);

    // Create a mesh-like radial/conic blend
    // Using multiple radial gradients to simulate mesh
    return `
    radial-gradient(at ${pos1}% ${pos2}%, ${colors[0]} 0px, transparent 50%),
    radial-gradient(at ${pos2}% ${pos3}%, ${colors[1]} 0px, transparent 50%),
    radial-gradient(at ${pos3}% ${pos1}%, ${colors[2]} 0px, transparent 50%),
    linear-gradient(to bottom right, #000000, #18181b)
  `;
}

export function generateMeshGradientSimple(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Vibrant but dark "Cyberpunk/Glass" colors
    const colors = [
        'rgba(6,182,212,0.15)', // Cyan
        'rgba(217,70,239,0.15)', // Fuchsia
        'rgba(16,185,129,0.15)', // Emerald
        'rgba(99,102,241,0.15)', // Indigo
        'rgba(245,158,11,0.15)', // Amber
    ];

    const c1 = colors[Math.abs(hash) % colors.length];
    const c2 = colors[Math.abs(hash >> 3) % colors.length];

    // Subtle gradient for card backgrounds
    return `linear-gradient(135deg, ${c1} 0%, rgba(0,0,0,0) 50%, ${c2} 100%)`;
}

export function generateDAOMesh(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }

    // High-vibrancy theme colors
    const colors = [
        'rgba(6,182,212,0.4)',  // Cyan
        'rgba(217,70,239,0.4)', // Fuchsia
        'rgba(16,185,129,0.4)', // Emerald
        'rgba(99,102,241,0.4)', // Indigo
        'rgba(79,70,229,0.4)',  // Violet
    ];

    const idx1 = Math.abs(hash) % colors.length;
    const idx2 = Math.abs(hash >> 4) % colors.length;
    const idx3 = Math.abs(hash >> 8) % colors.length;

    const p1 = Math.abs(hash % 100);
    const p2 = Math.abs((hash >> 2) % 100);
    const p3 = Math.abs((hash >> 4) % 100);
    const p4 = Math.abs((hash >> 6) % 100);

    return `
      radial-gradient(at ${p1}% ${p2}%, ${colors[idx1]} 0px, transparent 50%),
      radial-gradient(at ${p3}% ${p4}%, ${colors[idx2]} 0px, transparent 50%),
      radial-gradient(at ${p2}% ${p3}%, ${colors[idx3]} 0px, transparent 50%),
      linear-gradient(135deg, rgba(0,0,0,0.8) 0%, rgba(24,24,27,1) 100%)
    `;
}
