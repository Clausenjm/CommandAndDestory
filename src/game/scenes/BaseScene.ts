import { Display, GameObjects, Scene, TintModes } from 'phaser';
import { FACTIONS, GRID_COLS, GRID_ROWS } from '../data';
import { store } from '../store';
import { drawBuilding, drawCrystals } from '../draw';
import { BASE_BG, artFor, dirIndex, fitSprite, makeSprite, setFacing } from '../sprites';

/** Harvester loop: drive a quarter of the way round the pile, then stop and work it. */
/** Outline: 8 silhouette copies of a sprite pushed out this many px in each direction. */
const OUTLINE_PX = 2.5;
const OUTLINE_DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);

const DRIVE_S = 2.6, HARVEST_S = 1.8, TURN_S = 0.09, DROID = 0.72; // droid size, fraction of a tile

export const HUD = { top: 64, bottom: 150, right: 320, left: 16 };

export class BaseScene extends Scene {
    private back!: GameObjects.Graphics; // backdrop (below the terrain picture)
    private bg: GameObjects.Image | null = null;
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
    private outlines: Record<'sel' | 'hover', GameObjects.Sprite[]> = { sel: [], hover: [] };
    private harvesters = new Map<string, { spr: GameObjects.Sprite | null; dir: number; turnT: number; seed: number }>();

    constructor() { super('Base'); }

    create() {
        this.back = this.add.graphics().setDepth(-2);
        this.bg = this.textures.exists(BASE_BG) ? this.add.image(0, 0, BASE_BG).setDepth(-1) : null;
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
            this.harvesters.forEach(h => h.spr?.destroy());
            this.harvesters.clear();
            this.outlines.sel.forEach(o => o.destroy());
            this.outlines.hover.forEach(o => o.destroy());
            this.outlines = { sel: [], hover: [] };
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
        this.updateHarvesters(delta / 1000);
    }

    /** One harvester droid per Extractor, driving loops around its crystal pile. */
    private updateHarvesters(dt: number) {
        const s = store.state;
        if (!s) return;
        const { ts, ox, oy, fx } = this;
        const seen = new Set<string>();
        for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) {
            const t = s.grid[r][c];
            if (t.b?.kind !== 'extractor') continue;
            const id = `${r},${c}`;
            seen.add(id);
            let h = this.harvesters.get(id);
            if (!h) {
                h = { spr: makeSprite(this, 'drone-harvester', 0, 0, ts * DROID), dir: 0, turnT: 0, seed: (r * 7 + c * 13) % 10 };
                this.harvesters.set(id, h);
            }
            // where on the loop: segments of (drive, harvest), each covering a quarter turn
            const cycle = DRIVE_S + HARVEST_S;
            const time = this.t + h.seed * 0.9;
            const k = Math.floor(time / cycle), local = time - k * cycle;
            const driving = local < DRIVE_S;
            const p = driving ? local / DRIVE_S : 1;
            const eased = p * p * (3 - 2 * p);
            const th = (h.seed * Math.PI) / 5 + (k + eased) * (Math.PI / 2); // clockwise on screen
            const cx = ox + c * ts + ts / 2, cy = oy + r * ts + ts / 2;
            const rx = ts * 0.5, ry = ts * 0.42;
            const x = cx + rx * Math.cos(th);
            const y = cy + ry * Math.sin(th) + (driving ? Math.sin(this.t * 40) * 0.6 : 0);
            // face along the path while driving, toward the crystals while harvesting; turn one step at a time
            const want = driving
                ? dirIndex(-rx * Math.sin(th), ry * Math.cos(th))
                : dirIndex(cx - x, cy - y);
            h.turnT += dt;
            if (h.dir !== want && h.turnT >= TURN_S) {
                h.turnT = 0;
                h.dir = (h.dir + (((want - h.dir + 8) % 8) <= 4 ? 1 : 7)) % 8;
            }
            const depth = y < cy ? 1.9 : 2.1; // behind the extractor on the far side of the loop
            fx.fillStyle(0x000000, 0.35); fx.fillEllipse(x, y + ts * 0.17, ts * 0.46, ts * 0.16); // ground shadow
            if (h.spr) {
                fitSprite(h.spr, ts * DROID);
                setFacing(h.spr, h.dir);
                h.spr.setPosition(x, y + (h.spr.getData('offsetY') as number)).setDepth(depth);
            } else {
                // no art: a small box droid
                const sz = ts * 0.16;
                fx.fillStyle(0x000000, 0.35); fx.fillEllipse(x, y + sz * 0.8, sz * 2.2, sz * 0.8);
                fx.fillStyle(0x5a5f48, 1); fx.fillRect(x - sz, y - sz, sz * 2, sz * 1.6);
                fx.fillStyle(0xd9a93a, 1); fx.fillRect(x - sz * 0.5, y - sz * 0.6, sz, sz * 0.5);
            }
            // harvesting sparkle between droid and pile
            if (!driving) {
                const k2 = ((local - DRIVE_S) / HARVEST_S) * 4 % 1;
                const mx = x + (cx - x) * 0.35, my = y + (cy - y) * 0.35 - k2 * ts * 0.12;
                fx.fillStyle(t.field === 'azurite' ? 0x8fc6ff : 0x8af09a, 1 - k2);
                fx.fillCircle(mx, my, ts * 0.035 * (1 - k2 * 0.5));
            }
        }
        for (const [id, h] of this.harvesters) {
            if (!seen.has(id)) { h.spr?.destroy(); this.harvesters.delete(id); }
        }
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
        const back = this.back;
        back.clear();
        back.fillStyle(0x15181c, 1); back.fillRect(0, 0, W, H);
        const bw = ts * GRID_COLS, bh = ts * GRID_ROWS;
        if (this.bg) {
            // terrain picture, aspect kept, covering the grid with a margin so its border frames the base
            const tex = this.bg.texture.getSourceImage() as { width: number; height: number };
            const k = Math.max((bw + ts * 1.2) / tex.width, (bh + ts * 1.2) / tex.height);
            this.bg.setScale(k).setPosition(ox + bw / 2, oy + bh / 2);
            if (ui.buildKind) { // faint grid only while placing a building
                g.lineStyle(1, 0xffffff, 0.12);
                for (let c = 0; c <= GRID_COLS; c++) g.lineBetween(ox + c * ts, oy, ox + c * ts, oy + bh);
                for (let r = 0; r <= GRID_ROWS; r++) g.lineBetween(ox, oy + r * ts, ox + bw, oy + r * ts);
            }
        } else {
            back.fillStyle(0x000000, 0.5); back.fillRoundedRect(ox - 14, oy - 14, bw + 28, bh + 28, 12);
            back.lineStyle(3, accent, 0.6); back.strokeRoundedRect(ox - 14, oy - 14, bw + 28, bh + 28, 12);
            for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) {
                const x = ox + c * ts, y = oy + r * ts;
                const shade = ((r * 7 + c * 13) % 5) * 3;
                back.fillStyle(Display.Color.GetColor(58 + shade, 48 + shade, 38 + shade), 1);
                back.fillRect(x, y, ts, ts);
                back.lineStyle(1, 0x000000, 0.25); back.strokeRect(x, y, ts, ts);
            }
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
            // an Extractor on a field shows only the crystals and its harvester droid
            if (t.b && !(t.b.kind === 'extractor' && t.field)) {
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
            if (ui.buildKind || !this.spriteAt(ui.hover.r, ui.hover.c)) { // sprites get an outline instead (drawFx)
                g.lineStyle(2, ui.buildKind ? (bad ? 0xff5050 : 0x5ee06a) : 0xffffff, ui.buildKind ? 0.9 : 0.35);
                g.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
            }
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

    /** The sprite that represents tile (r,c): its building, or the crystals under an Extractor. */
    private spriteAt(r: number, c: number) {
        const t = store.state?.grid[r]?.[c];
        if (!t) return null;
        if (t.b && !(t.b.kind === 'extractor' && t.field)) return this.sprites.get(`b${r},${c}`) ?? null;
        if (t.field) return this.sprites.get(`f${r},${c}`) ?? null;
        return null;
    }

    /** Draw (or hide) a solid-colour outline that follows `target`'s shape. */
    private syncOutline(which: 'sel' | 'hover', target: GameObjects.Sprite | null, color: number, alpha: number) {
        const pool = this.outlines[which];
        if (!target) { pool.forEach(o => o.setVisible(false)); return; }
        OUTLINE_DIRS.forEach(([dx, dy], i) => {
            let o = pool[i];
            if (!o) {
                o = this.add.sprite(0, 0, target.texture.key, target.frame.name).setTintMode(TintModes.FILL);
                pool[i] = o;
            }
            if (o.texture.key !== target.texture.key || o.frame.name !== target.frame.name) o.setTexture(target.texture.key, target.frame.name);
            o.setOrigin(target.originX, target.originY).setScale(target.scaleX, target.scaleY)
                .setRotation(target.rotation).setFlip(target.flipX, target.flipY)
                .setPosition(target.x + dx * OUTLINE_PX, target.y + dy * OUTLINE_PX)
                .setDepth(target.depth - 0.01).setTint(color).setAlpha(alpha).setVisible(true);
        });
    }

    private drawFx() {
        const ui = store.ui, s = store.state;
        this.fx.clear();
        const hov = ui.hover && !ui.buildKind && !(ui.selected && ui.selected.r === ui.hover.r && ui.selected.c === ui.hover.c)
            ? this.spriteAt(ui.hover.r, ui.hover.c) : null;
        this.syncOutline('hover', hov, 0xffffff, 0.45);
        const selSprite = s && ui.selected ? this.spriteAt(ui.selected.r, ui.selected.c) : null;
        this.syncOutline('sel', selSprite, 0xffffff, 0.65 + Math.sin(this.t * 5) * 0.3);
        if (!s || !ui.selected || selSprite) return;
        // no art for this building: fall back to the square
        const { ts, ox, oy } = this;
        const x = ox + ui.selected.c * ts, y = oy + ui.selected.r * ts;
        this.fx.lineStyle(3, 0xffffff, 0.55 + Math.sin(this.t * 5) * 0.35);
        this.fx.strokeRoundedRect(x + 2, y + 2, ts - 4, ts - 4, 8);
    }
}
