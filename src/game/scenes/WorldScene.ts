import { Display, GameObjects, Scene } from 'phaser';
import { ATTACK_RANGE, FACTIONS, WORLD_SIZE, campName } from '../data';
import { rng } from '../battle';
import { store } from '../store';
import { makeSprite } from '../sprites';

const T = 44; // world tile size in px

export class WorldScene extends Scene {
    private terrain!: GameObjects.Graphics;
    private layer!: GameObjects.Graphics;
    private fx!: GameObjects.Graphics;
    private labels: GameObjects.Text[] = [];
    private sprites: GameObjects.Sprite[] = [];
    private drawn = -1;
    private dragDist = 0;
    private t = 0;

    constructor() { super('World'); }

    create() {
        const s = store.state!;
        this.terrain = this.add.graphics();
        this.layer = this.add.graphics();
        this.fx = this.add.graphics().setDepth(5);
        this.drawTerrain();
        this.drawn = -1;

        const cam = this.cameras.main;
        cam.setBounds(-200, -200, WORLD_SIZE * T + 400, WORLD_SIZE * T + 400);
        cam.centerOn(s.home.x * T + T / 2, s.home.y * T + T / 2);

        this.input.on('pointerdown', () => { this.dragDist = 0; });
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            if (!p.isDown) return;
            const dx = p.x - p.prevPosition.x, dy = p.y - p.prevPosition.y;
            this.dragDist += Math.abs(dx) + Math.abs(dy);
            cam.scrollX -= dx / cam.zoom;
            cam.scrollY -= dy / cam.zoom;
        });
        this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
            if (this.dragDist > 6) return;
            const wx = p.worldX, wy = p.worldY;
            const st = store.state!;
            let best: number | null = null, bestD = T * 0.8;
            for (const c of st.camps) {
                const d = Math.hypot(c.x * T + T / 2 - wx, c.y * T + T / 2 - wy);
                if (d < bestD) { bestD = d; best = c.id; }
            }
            store.setUi({ selectedCamp: best, panel: best ? 'info' : store.ui.panel });
        });
        this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
            cam.setZoom(Math.min(2, Math.max(0.45, cam.zoom * (dy > 0 ? 0.9 : 1.1))));
        });
    }

    private drawTerrain() {
        const g = this.terrain;
        const r = rng(1234);
        // value noise on a coarse lattice, bilinear upsampled
        const N = 11, step = WORLD_SIZE / (N - 1);
        const lat = Array.from({ length: N * N }, () => r());
        const noise = (x: number, y: number) => {
            const gx = x / step, gy = y / step;
            const x0 = Math.floor(gx), y0 = Math.floor(gy);
            const fx = gx - x0, fy = gy - y0;
            const v = (i: number, j: number) => lat[Math.min(N - 1, j) * N + Math.min(N - 1, i)];
            const a = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx;
            const b = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
            return a * (1 - fy) + b * fy;
        };
        g.fillStyle(0x0d2a3a, 1);
        g.fillRect(-200, -200, WORLD_SIZE * T + 400, WORLD_SIZE * T + 400);
        for (let y = 0; y < WORLD_SIZE; y++) for (let x = 0; x < WORLD_SIZE; x++) {
            const n = noise(x, y) * 0.8 + r() * 0.2;
            const lo = Display.Color.ValueToColor(0x6b5a3e), hi = Display.Color.ValueToColor(0x4f6b38);
            const c = Display.Color.Interpolate.ColorWithColor(lo, hi, 100, Math.round(n * 100));
            g.fillStyle(Display.Color.GetColor(c.r, c.g, c.b), 1);
            g.fillRect(x * T, y * T, T + 1, T + 1);
        }
        // region grid lines
        g.lineStyle(2, 0xffffff, 0.07);
        for (let i = 0; i <= WORLD_SIZE; i += 5) {
            g.lineBetween(i * T, 0, i * T, WORLD_SIZE * T);
            g.lineBetween(0, i * T, WORLD_SIZE * T, i * T);
        }
        g.lineStyle(4, 0x9ad7ff, 0.35);
        g.strokeRect(0, 0, WORLD_SIZE * T, WORLD_SIZE * T);
    }

    private drawLayer() {
        const s = store.state!;
        const g = this.layer;
        g.clear();
        this.labels.forEach(l => l.destroy());
        this.labels = [];
        this.sprites.forEach(sp => sp.destroy());
        this.sprites = [];
        const sprite = (key: string, x: number, y: number) => {
            const sp = makeSprite(this, key, x, y, T);
            if (sp) { sp.y += sp.getData('offsetY') as number; this.sprites.push(sp); }
            return !!sp;
        };
        const accent = FACTIONS[s.faction].hex;
        const hx = s.home.x * T + T / 2, hy = s.home.y * T + T / 2;
        // attack range
        g.fillStyle(accent, 0.06); g.fillCircle(hx, hy, ATTACK_RANGE * T);
        g.lineStyle(2, accent, 0.5); g.strokeCircle(hx, hy, ATTACK_RANGE * T);

        const text = (x: number, y: number, str: string, color: string, size = 13) => {
            const t = this.add.text(x, y, str, {
                fontFamily: 'Segoe UI, Arial', fontSize: `${size}px`, color, align: 'center',
                backgroundColor: '#000000b0', padding: { x: 5, y: 2 },
            }).setOrigin(0.5, 0).setDepth(6);
            this.labels.push(t);
        };

        for (const c of s.camps) {
            const x = c.x * T + T / 2, y = c.y * T + T / 2;
            const inRange = Math.hypot(c.x - s.home.x, c.y - s.home.y) <= ATTACK_RANGE;
            const tier = c.level >= 9 ? 'fortress' : c.level >= 5 ? 'outpost' : 'camp';
            if (!sprite(`world-${tier}`, x, y) && !sprite('world-camp', x, y)) {
                g.fillStyle(0x000000, 0.4); g.fillCircle(x + 2, y + 3, T * 0.36);
                g.fillStyle(0x6b3a26, 1); g.fillCircle(x, y, T * 0.34);
                g.fillStyle(c.level >= 9 ? 0xff3b3b : c.level >= 5 ? 0xff8a3b : 0xffc23b, 1);
                g.fillTriangle(x - T * 0.18, y + T * 0.12, x + T * 0.18, y + T * 0.12, x, y - T * 0.2);
                g.fillStyle(0x222222, 1); g.fillCircle(x, y + T * 0.02, T * 0.06);
            }
            text(x, y + T * 0.38, `${campName(c.level)}\nLvl ${c.level}`, inRange ? '#ffe2b8' : '#a08c74', 12);
        }
        // home base
        if (!sprite('world-home', hx, hy)) {
            g.fillStyle(0x000000, 0.5); g.fillRoundedRect(hx - T * 0.45 + 3, hy - T * 0.45 + 4, T * 0.9, T * 0.9, 8);
            g.fillStyle(0x2a3038, 1); g.fillRoundedRect(hx - T * 0.45, hy - T * 0.45, T * 0.9, T * 0.9, 8);
            g.lineStyle(3, accent, 1); g.strokeRoundedRect(hx - T * 0.45, hy - T * 0.45, T * 0.9, T * 0.9, 8);
            g.fillStyle(accent, 1); g.fillCircle(hx, hy, T * 0.18);
        }
        text(hx, hy + T * 0.5, `${s.name}\n(your base)`, FACTIONS[s.faction].color, 13);
    }

    update(_time: number, delta: number) {
        this.t += delta / 1000;
        if (this.drawn !== store.layoutVersion) { this.drawn = store.layoutVersion; this.drawLayer(); }
        const s = store.state!;
        this.fx.clear();
        const sel = s.camps.find(c => c.id === store.ui.selectedCamp);
        if (sel) {
            const x = sel.x * T + T / 2, y = sel.y * T + T / 2;
            this.fx.lineStyle(3, 0xffffff, 0.6 + Math.sin(this.t * 5) * 0.3);
            this.fx.strokeCircle(x, y, T * 0.5 + Math.sin(this.t * 5) * 2);
            this.fx.lineStyle(2, FACTIONS[s.faction].hex, 0.5);
            this.fx.lineBetween(s.home.x * T + T / 2, s.home.y * T + T / 2, x, y);
        }
    }
}
