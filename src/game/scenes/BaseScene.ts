import { Display, GameObjects, Scene } from 'phaser';
import { FACTIONS, GRID_COLS, GRID_ROWS } from '../data';
import { store } from '../store';
import { drawBuilding, drawCrystals } from '../draw';
import { artFor, fitSprite, makeSprite } from '../sprites';

export const HUD = { top: 64, bottom: 150, right: 320, left: 16 };

export class BaseScene extends Scene {
    private g!: GameObjects.Graphics;
    private fx!: GameObjects.Graphics;
    private labels: GameObjects.Text[] = [];
    private sprites = new Map<string, GameObjects.Sprite>();
    private touched = new Set<string>();
    private ts = 64;
    private ox = 0;
    private oy = 0;
    private drawnLayout = -1;
    private drawnUi = '';
    private t = 0;

    constructor() { super('Base'); }

    create() {
        this.g = this.add.graphics();
        this.fx = this.add.graphics().setDepth(4);
        this.drawnLayout = -1;
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            const tile = this.tileAt(p.x, p.y);
            const h = store.ui.hover;
            if (!tile) { if (h) store.setUi({ hover: null }); return; }
            if (!h || h.r !== tile.r || h.c !== tile.c) store.setUi({ hover: { ...tile, sx: p.x, sy: p.y } });
        });
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
            const tile = this.tileAt(p.x, p.y);
            if (p.rightButtonDown()) { store.setUi({ buildKind: null }); return; }
            if (!tile) return;
            const ui = store.ui;
            if (ui.buildKind) {
                if (store.build(ui.buildKind, tile.r, tile.c)) {
                    store.setUi({ selected: tile, panel: 'info', buildKind: null }, true);
                }
                return;
            }
            const b = store.state!.grid[tile.r][tile.c].b;
            store.setUi({ selected: b ? tile : null, panel: b ? 'info' : store.ui.panel });
        });
        this.input.mouse?.disableContextMenu();
        this.scale.on('resize', this.onResize, this);
        this.events.once('shutdown', () => {
            this.sprites.forEach(sp => sp.destroy());
            this.sprites.clear();
            this.scale.off('resize', this.onResize, this);
            store.setUi({ hover: null });
        });
        this.onResize();
    }

    private onResize() { this.drawnLayout = -1; }

    private tileAt(x: number, y: number) {
        const c = Math.floor((x - this.ox) / this.ts);
        const r = Math.floor((y - this.oy) / this.ts);
        if (r < 0 || c < 0 || r >= GRID_ROWS || c >= GRID_COLS) return null;
        return { r, c };
    }

    update(_time: number, delta: number) {
        this.t += delta / 1000;
        const ui = store.ui;
        const uiKey = `${ui.buildKind}|${ui.selected?.r},${ui.selected?.c}|${ui.hover?.r},${ui.hover?.c}`;
        if (this.drawnLayout !== store.layoutVersion || uiKey !== this.drawnUi) {
            this.drawnLayout = store.layoutVersion;
            this.drawnUi = uiKey;
            this.redraw();
        }
        this.drawFx();
    }

    private redraw() {
        const s = store.state;
        if (!s) return;
        const W = this.scale.width, H = this.scale.height;
        const availW = W - HUD.left - HUD.right - 40, availH = H - HUD.top - HUD.bottom - 30;
        this.ts = Math.max(32, Math.floor(Math.min(availW / GRID_COLS, availH / GRID_ROWS)));
        this.ox = Math.floor(HUD.left + 20 + (availW - this.ts * GRID_COLS) / 2);
        this.oy = Math.floor(HUD.top + 15 + (availH - this.ts * GRID_ROWS) / 2);
        const { ts, ox, oy, g } = this;
        const accent = FACTIONS[s.faction].hex;
        const ui = store.ui;

        g.clear();
        this.labels.forEach(l => l.destroy());
        this.labels = [];
        this.touched.clear();

        // backdrop: wasteland
        g.fillStyle(0x15181c, 1); g.fillRect(0, 0, W, H);
        // base plate
        const bw = ts * GRID_COLS, bh = ts * GRID_ROWS;
        g.fillStyle(0x000000, 0.5); g.fillRoundedRect(ox - 14, oy - 14, bw + 28, bh + 28, 12);
        g.lineStyle(3, accent, 0.6); g.strokeRoundedRect(ox - 14, oy - 14, bw + 28, bh + 28, 12);
        for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) {
            const x = ox + c * ts, y = oy + r * ts;
            const shade = ((r * 7 + c * 13) % 5) * 3;
            g.fillStyle(Display.Color.GetColor(58 + shade, 48 + shade, 38 + shade), 1);
            g.fillRect(x, y, ts, ts);
            g.lineStyle(1, 0x000000, 0.25); g.strokeRect(x, y, ts, ts);
        }
        // tiles
        for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) {
            const t = s.grid[r][c];
            const x = ox + c * ts, y = oy + r * ts;
            if (t.field && !this.syncSprite(`f${r},${c}`, `field-${t.field}`, x + ts / 2, y + ts / 2, ts, 1)) drawCrystals(g, x + ts / 2, y + ts / 2, ts, t.field === 'verdite' ? 0x5ee06a : 0x5fa8ff, r * 31 + c * 7 + 1);
            if (ui.buildKind) {
                const ok = !store.buildBlockReason(ui.buildKind, r, c);
                if (ok) { g.fillStyle(0x5ee06a, 0.18); g.fillRect(x + 2, y + 2, ts - 4, ts - 4); }
            }
            if (t.b) {
                if (!this.syncSprite(`b${r},${c}`, `building-${t.b.kind}`, x + ts / 2, y + ts / 2, ts, 2)) {
                    drawBuilding(g, t.b.kind, x, y, ts, accent);
                } else {
                    g.fillStyle(accent, 0.8); g.fillRect(x + ts * 0.2, y + ts - 4, ts * 0.6, 3); // faction stripe
                }
                const lbl = this.add.text(x + ts - 6, y + ts - 5, String(t.b.level), {
                    fontFamily: 'Segoe UI, Arial', fontSize: `${Math.max(10, Math.round(ts * 0.2))}px`, color: '#ffffff',
                    backgroundColor: '#000000aa', padding: { x: 4, y: 1 },
                }).setOrigin(1, 1).setDepth(5);
                this.labels.push(lbl);
            }
        }
        // hover / selection
        if (ui.hover) {
            const x = ox + ui.hover.c * ts, y = oy + ui.hover.r * ts;
            const bad = ui.buildKind && store.buildBlockReason(ui.buildKind, ui.hover.r, ui.hover.c);
            g.lineStyle(2, ui.buildKind ? (bad ? 0xff5050 : 0x5ee06a) : 0xffffff, 0.9);
            g.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
            if (ui.buildKind && !bad && !this.syncSprite('ghost', `building-${ui.buildKind}`, x + ts / 2, y + ts / 2, ts, 3, 0.6)) {
                drawBuilding(g, ui.buildKind, x, y, ts, accent);
            }
        }
        // remove sprites for things that no longer exist
        for (const [id, sp] of this.sprites) {
            if (!this.touched.has(id)) { sp.destroy(); this.sprites.delete(id); }
        }
    }

    /**
     * Keep one sprite per slot `id` showing art `key`. Returns false (and draws nothing)
     * when that art isn't in the sprite manifest, so the caller can draw shapes instead.
     * Existing sprites are kept so their animations don't restart on every redraw.
     */
    private syncSprite(id: string, key: string, x: number, y: number, size: number, depth: number, alpha = 1) {
        if (!artFor(key)) return false;
        let sp = this.sprites.get(id);
        if (sp && sp.getData('art') !== key) { sp.destroy(); sp = undefined; }
        if (!sp) {
            sp = makeSprite(this, key, x, y, size)!;
            this.sprites.set(id, sp);
        }
        fitSprite(sp, size);
        sp.setPosition(x, y + (sp.getData('offsetY') as number)).setDepth(depth).setAlpha(alpha);
        this.touched.add(id);
        return true;
    }

    private drawFx() {
        const ui = store.ui, s = store.state;
        this.fx.clear();
        if (!s || !ui.selected) return;
        const { ts, ox, oy } = this;
        const x = ox + ui.selected.c * ts, y = oy + ui.selected.r * ts;
        const a = 0.55 + Math.sin(this.t * 5) * 0.35;
        this.fx.lineStyle(3, 0xffffff, a);
        this.fx.strokeRoundedRect(x + 2, y + 2, ts - 4, ts - 4, 8);
        // highlight adjacency
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const r = ui.selected.r + dr, c = ui.selected.c + dc;
            if (r < 0 || c < 0 || r >= GRID_ROWS || c >= GRID_COLS) continue;
            this.fx.fillStyle(0xffffff, 0.05);
            this.fx.fillRect(ox + c * ts, oy + r * ts, ts, ts);
        }
    }
}
