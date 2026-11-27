// Procedural vector art shared by the scenes (no external sprite assets needed).
import { GameObjects } from 'phaser';
import { BUILDINGS, BuildingKind, EnemyKind, UnitKind } from './data';
import { rng } from './battle';

type G = GameObjects.Graphics;

export function drawCrystals(g: G, cx: number, cy: number, size: number, color: number, seed: number) {
    const r = rng(seed);
    g.fillStyle(color, 0.16);
    g.fillCircle(cx, cy, size * 0.48);
    const n = 6;
    for (let i = 0; i < n; i++) {
        const px = cx + (r() - 0.5) * size * 0.65;
        const py = cy + (r() - 0.5) * size * 0.6;
        const h = size * (0.18 + r() * 0.18);
        const w = h * 0.38;
        g.fillStyle(color, 0.95);
        g.fillTriangle(px - w, py, px + w, py, px, py - h);
        g.fillStyle(0xffffff, 0.35);
        g.fillTriangle(px - w * 0.2, py, px + w * 0.5, py, px, py - h * 0.9);
        g.fillStyle(color, 0.6);
        g.fillTriangle(px - w, py, px + w, py, px, py + h * 0.3);
    }
}

/** Building art inside a tile at (x,y) top-left with tile size s. */
export function drawBuilding(g: G, kind: BuildingKind, x: number, y: number, s: number, accent: number) {
    const cx = x + s / 2, cy = y + s / 2;
    const col = BUILDINGS[kind].color;
    const pad = s * 0.1;
    // footing
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x + pad + 3, y + pad + 4, s - pad * 2, s - pad * 2, s * 0.12);
    g.fillStyle(0x2a3038, 1);
    g.fillRoundedRect(x + pad, y + pad, s - pad * 2, s - pad * 2, s * 0.12);
    g.lineStyle(2, accent, 0.9);
    g.strokeRoundedRect(x + pad, y + pad, s - pad * 2, s - pad * 2, s * 0.12);

    switch (kind) {
        case 'hub': {
            const pts = [];
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI / 4) * i + Math.PI / 8;
                pts.push({ x: cx + Math.cos(a) * s * 0.34, y: cy + Math.sin(a) * s * 0.34 });
            }
            g.fillStyle(col, 1); g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
            g.fillStyle(accent, 1); g.fillCircle(cx, cy, s * 0.16);
            g.fillStyle(0xffffff, 0.5); g.fillCircle(cx - s * 0.05, cy - s * 0.05, s * 0.05);
            break;
        }
        case 'extractor': {
            g.fillStyle(col, 1);
            g.fillRect(cx - s * 0.22, cy - s * 0.05, s * 0.44, s * 0.22);
            g.fillTriangle(cx - s * 0.12, cy - s * 0.05, cx + s * 0.12, cy - s * 0.05, cx, cy - s * 0.3);
            g.fillStyle(0x222222, 1);
            g.fillCircle(cx - s * 0.13, cy + s * 0.2, s * 0.06);
            g.fillCircle(cx + s * 0.13, cy + s * 0.2, s * 0.06);
            g.fillStyle(accent, 1); g.fillRect(cx - s * 0.22, cy + s * 0.02, s * 0.44, s * 0.04);
            break;
        }
        case 'generator': {
            g.fillStyle(0x555b63, 1); g.fillCircle(cx, cy, s * 0.27);
            g.fillStyle(col, 1); g.fillCircle(cx, cy, s * 0.2);
            g.fillStyle(0x2a3038, 1);
            g.fillTriangle(cx + s * 0.03, cy - s * 0.16, cx - s * 0.09, cy + s * 0.02, cx + s * 0.01, cy + s * 0.02);
            g.fillTriangle(cx - s * 0.03, cy + s * 0.16, cx + s * 0.09, cy - s * 0.02, cx - s * 0.01, cy - s * 0.02);
            break;
        }
        case 'refinery': {
            g.fillStyle(col, 1);
            g.fillRoundedRect(cx - s * 0.28, cy - s * 0.2, s * 0.22, s * 0.42, s * 0.06);
            g.fillRoundedRect(cx + s * 0.04, cy - s * 0.26, s * 0.22, s * 0.48, s * 0.06);
            g.fillStyle(accent, 1); g.fillRect(cx - s * 0.06, cy - s * 0.02, s * 0.1, s * 0.06);
            g.fillStyle(0xffd84a, 1); g.fillCircle(cx + s * 0.15, cy - s * 0.15, s * 0.04);
            break;
        }
        case 'vault': {
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i;
                pts.push({ x: cx + Math.cos(a) * s * 0.28, y: cy + Math.sin(a) * s * 0.28 });
            }
            g.fillStyle(col, 1); g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
            g.fillStyle(0x5ee06a, 1); g.fillTriangle(cx - s * 0.1, cy + s * 0.08, cx - s * 0.02, cy + s * 0.08, cx - s * 0.06, cy - s * 0.1);
            g.fillStyle(0x5fa8ff, 1); g.fillTriangle(cx + s * 0.02, cy + s * 0.08, cx + s * 0.1, cy + s * 0.08, cx + s * 0.06, cy - s * 0.1);
            break;
        }
        case 'battery': {
            for (let i = 0; i < 3; i++) {
                g.fillStyle(col, 1);
                g.fillRoundedRect(cx - s * 0.27 + i * s * 0.19, cy - s * 0.22, s * 0.15, s * 0.44, s * 0.03);
                g.fillStyle(0x2a3038, 1);
                g.fillRect(cx - s * 0.24 + i * s * 0.19, cy - s * 0.26, s * 0.09, s * 0.05);
            }
            break;
        }
        case 'barracks': {
            g.fillStyle(col, 1); g.fillRect(cx - s * 0.3, cy - s * 0.18, s * 0.6, s * 0.36);
            g.fillStyle(0x2a3038, 1);
            for (let i = 0; i < 3; i++) g.fillRect(cx - s * 0.24 + i * s * 0.18, cy - s * 0.12, s * 0.1, s * 0.08);
            g.fillStyle(accent, 1); g.fillRect(cx - s * 0.06, cy + s * 0.04, s * 0.12, s * 0.14);
            break;
        }
        case 'vehiclebay': {
            g.fillStyle(col, 1); g.fillRect(cx - s * 0.32, cy - s * 0.2, s * 0.64, s * 0.4);
            g.fillStyle(0x1a1e24, 1); g.fillRect(cx - s * 0.2, cy - s * 0.04, s * 0.4, s * 0.24);
            g.lineStyle(2, accent, 1);
            for (let i = 0; i < 3; i++) g.lineBetween(cx - s * 0.2, cy + i * s * 0.07, cx + s * 0.2, cy + i * s * 0.07);
            break;
        }
    }
}

export function drawUnit(g: G, kind: UnitKind | EnemyKind, x: number, y: number, s: number, color: number, facingUp: boolean) {
    const d = facingUp ? -1 : 1;
    switch (kind) {
        case 'trooper': case 'militia':
            g.fillStyle(color, 1); g.fillCircle(x, y, s * 0.16);
            g.fillStyle(0x111111, 1); g.fillRect(x - s * 0.02, y + d * s * 0.05, s * 0.04, d * s * 0.18);
            break;
        case 'lancer':
            g.fillStyle(color, 1); g.fillCircle(x, y, s * 0.15);
            g.fillStyle(0xdddddd, 1); g.fillRect(x + s * 0.06, y - s * 0.2, s * 0.06, s * 0.3);
            break;
        case 'rover': case 'buggy':
            g.fillStyle(0x111111, 1); g.fillRect(x - s * 0.26, y - s * 0.2, s * 0.52, s * 0.4);
            g.fillStyle(color, 1); g.fillRoundedRect(x - s * 0.2, y - s * 0.24, s * 0.4, s * 0.48, s * 0.08);
            g.fillStyle(0x222222, 1); g.fillRect(x - s * 0.03, y, s * 0.06, d * s * 0.3);
            break;
        case 'breaker':
            g.fillStyle(0x111111, 1); g.fillRect(x - s * 0.32, y - s * 0.3, s * 0.64, s * 0.6);
            g.fillStyle(color, 1); g.fillRoundedRect(x - s * 0.26, y - s * 0.26, s * 0.52, s * 0.52, s * 0.08);
            g.fillStyle(0x333333, 1); g.fillCircle(x, y, s * 0.14);
            g.fillRect(x - s * 0.04, y, s * 0.08, d * s * 0.42);
            break;
        case 'core': {
            g.fillStyle(0x4a2d22, 1); g.fillRoundedRect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84, s * 0.1);
            g.fillStyle(color, 1); g.fillCircle(x, y, s * 0.24);
            g.fillStyle(0x222222, 1); g.fillCircle(x, y, s * 0.1);
            break;
        }
        case 'depot':
            g.fillStyle(0x5a4632, 1); g.fillRect(x - s * 0.36, y - s * 0.3, s * 0.72, s * 0.6);
            g.fillStyle(0x5ee06a, 0.9); g.fillTriangle(x - s * 0.2, y + s * 0.15, x, y + s * 0.15, x - s * 0.1, y - s * 0.15);
            g.fillStyle(0x5fa8ff, 0.9); g.fillTriangle(x, y + s * 0.15, x + s * 0.2, y + s * 0.15, x + s * 0.1, y - s * 0.15);
            break;
        case 'shack':
            g.fillStyle(0x6b5a48, 1); g.fillRect(x - s * 0.34, y - s * 0.22, s * 0.68, s * 0.5);
            g.fillStyle(0x8a3b2a, 1); g.fillTriangle(x - s * 0.4, y - s * 0.2, x + s * 0.4, y - s * 0.2, x, y - s * 0.42);
            break;
        case 'gunnest':
            g.fillStyle(0x6b5a48, 1); g.fillCircle(x, y, s * 0.32);
            g.fillStyle(color, 1); g.fillCircle(x, y, s * 0.16);
            g.fillStyle(0x222222, 1); g.fillRect(x - s * 0.03, y, s * 0.06, s * 0.36);
            break;
        case 'cannon':
            g.fillStyle(0x6b5a48, 1); g.fillRoundedRect(x - s * 0.32, y - s * 0.32, s * 0.64, s * 0.64, s * 0.1);
            g.fillStyle(color, 1); g.fillCircle(x, y, s * 0.18);
            g.fillStyle(0x222222, 1); g.fillRect(x - s * 0.06, y, s * 0.12, s * 0.46);
            break;
    }
}
