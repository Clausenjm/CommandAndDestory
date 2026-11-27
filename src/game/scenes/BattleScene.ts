import { GameObjects, Scene } from 'phaser';
import { FACTIONS } from '../data';
import { ENEMY_ROWS, FIELD_H, FIELD_W } from '../battle';
import { store } from '../store';
import { drawUnit } from '../draw';
import { artFor, fitSprite, makeSprite, playAnim } from '../sprites';

export class BattleScene extends Scene {
    private g!: GameObjects.Graphics;
    private top!: GameObjects.Graphics; // hp bars, shots, explosions (above sprites)
    private sprites: (GameObjects.Sprite | null)[] | null = null;
    private dying = new Set<number>();
    private time0 = 0;
    private booms: { x: number; y: number; t: number }[] = [];
    private lastFrame = -1;

    constructor() { super('Battle'); }

    create() {
        this.g = this.add.graphics();
        this.top = this.add.graphics().setDepth(10);
        this.sprites = null;
        this.dying.clear();
        this.events.once('shutdown', () => { this.sprites?.forEach(sp => sp?.destroy()); this.sprites = null; });
        this.time0 = 0;
        this.booms = [];
        this.lastFrame = -1;
    }

    update(_t: number, delta: number) {
        const b = store.ui.battle;
        const s = store.state;
        if (!b || !s) return;
        const last = b.frames.length - 1;
        if (store.ui.battleSkip) this.time0 = last * b.dt;
        else this.time0 += (delta / 1000) * store.ui.battleSpeed;
        const fi = Math.min(last, Math.floor(this.time0 / b.dt));

        const W = this.scale.width, H = this.scale.height;
        const ts = Math.floor(Math.min((W - 80) / FIELD_W, (H - 140) / FIELD_H));
        const ox = Math.floor((W - ts * FIELD_W) / 2), oy = 90;
        const g = this.g;
        g.clear();
        this.top.clear();
        if (!this.sprites) {
            this.sprites = b.entities.map(e => makeSprite(this, `${e.side === 'att' ? 'unit' : 'enemy'}-${e.kind}`, 0, 0, ts));
        }
        g.fillStyle(0x15181c, 1); g.fillRect(0, 0, W, H);
        // ground
        for (let r = 0; r < FIELD_H; r++) for (let c = 0; c < FIELD_W; c++) {
            const enemy = r < ENEMY_ROWS;
            const shade = ((r * 5 + c * 11) % 4) * 3;
            g.fillStyle(enemy ? 0x4a3a2c + shade * 0x010101 : 0x3a3a30 + shade * 0x010101, 1);
            g.fillRect(ox + c * ts, oy + r * ts, ts, ts);
        }
        g.lineStyle(2, 0xff6a3d, 0.5); g.lineBetween(ox, oy + ENEMY_ROWS * ts, ox + FIELD_W * ts, oy + ENEMY_ROWS * ts);
        g.lineStyle(2, 0x000000, 0.6); g.strokeRect(ox, oy, FIELD_W * ts, FIELD_H * ts);

        const frame = b.frames[fi];
        const accent = FACTIONS[s.faction].hex;
        const px = (x: number) => ox + x * ts, py = (y: number) => oy + y * ts;

        // detect deaths since last drawn frame
        if (fi !== this.lastFrame && this.lastFrame >= 0 && fi > this.lastFrame) {
            const prev = b.frames[this.lastFrame];
            b.entities.forEach((_e, i) => {
                if (prev.pos[i * 3 + 2] > 0 && frame.pos[i * 3 + 2] <= 0) {
                    this.booms.push({ x: frame.pos[i * 3], y: frame.pos[i * 3 + 1], t: 0 });
                }
            });
        }
        this.lastFrame = fi;

        const prevFrame = b.frames[Math.max(0, fi - 1)];
        const shooters = new Map<number, number>(frame.shots.map(sh => [sh.from, sh.to]));
        b.entities.forEach((e, i) => {
            const x = frame.pos[i * 3], y = frame.pos[i * 3 + 1], hp = frame.pos[i * 3 + 2];
            const spr = this.sprites![i];
            if (hp <= 0) {
                if (e.side === 'def' && e.cat === 'struct') {
                    g.fillStyle(0x222222, 0.8); g.fillCircle(px(x), py(y), ts * 0.3);
                }
                if (spr && spr.visible && !this.dying.has(i)) {
                    this.dying.add(i);
                    if (playAnim(spr, 'death', true)) spr.once('animationcomplete', () => spr.setVisible(false));
                    else spr.setVisible(false);
                }
                return;
            }
            if (spr) {
                this.updateSprite(spr, e.side, e.cat, px(x), py(y), ts,
                    px(x) - px(prevFrame.pos[i * 3]), py(y) - py(prevFrame.pos[i * 3 + 1]),
                    shooters.has(i) ? { x: px(frame.pos[shooters.get(i)! * 3]), y: py(frame.pos[shooters.get(i)! * 3 + 1]) } : null);
            } else {
                const color = e.side === 'att' ? accent : 0xd94a2b;
                drawUnit(g, e.kind, px(x), py(y), ts, color, e.side === 'att');
            }
            // hp bar
            const t = this.top;
            const w = ts * 0.7, frac = hp / e.maxHp;
            t.fillStyle(0x000000, 0.7); t.fillRect(px(x) - w / 2, py(y) - ts * 0.46, w, 4);
            t.fillStyle(frac > 0.5 ? 0x5ee06a : frac > 0.25 ? 0xffd84a : 0xff5050, 1);
            t.fillRect(px(x) - w / 2, py(y) - ts * 0.46, w * frac, 4);
        });
        // shots: show those from the last few frames
        for (let k = Math.max(0, fi - 2); k <= fi; k++) {
            for (const sh of b.frames[k].shots) {
                const fpos = b.frames[k].pos;
                const a = b.entities[sh.from];
                this.top.lineStyle(2, a.side === 'att' ? 0xfff2a0 : 0xff8a5a, 1 - (fi - k) * 0.3);
                this.top.lineBetween(px(fpos[sh.from * 3]), py(fpos[sh.from * 3 + 1]), px(fpos[sh.to * 3]), py(fpos[sh.to * 3 + 1]));
                this.top.fillStyle(0xffffff, 0.8 - (fi - k) * 0.3);
                this.top.fillCircle(px(fpos[sh.to * 3]), py(fpos[sh.to * 3 + 1]), 3);
            }
        }
        // explosions
        const dtS = (delta / 1000) * Math.max(1, store.ui.battleSpeed);
        this.booms = this.booms.filter(bm => (bm.t += dtS) < 0.6);
        for (const bm of this.booms) {
            const k = bm.t / 0.6;
            this.top.fillStyle(0xffa040, 1 - k); this.top.fillCircle(px(bm.x), py(bm.y), ts * (0.2 + k * 0.5));
            this.top.fillStyle(0xffffff, (1 - k) * 0.7); this.top.fillCircle(px(bm.x), py(bm.y), ts * 0.15 * (1 - k));
        }

        if (fi >= last && !store.ui.battleDone) store.setUi({ battleDone: true });
    }

    /** Position a unit sprite and pick idle / move / attack animation. Art is assumed to face up. */
    private updateSprite(spr: GameObjects.Sprite, side: 'att' | 'def', cat: string, x: number, y: number, ts: number,
        dx: number, dy: number, aim: { x: number; y: number } | null) {
        const def = artFor(spr.getData('art') as string)!;
        fitSprite(spr, ts);
        spr.setPosition(x, y + (spr.getData('offsetY') as number)).setDepth(2 + y / 10000);
        const moving = Math.abs(dx) + Math.abs(dy) > 0.01;
        if (def.rotate) {
            if (aim) spr.setRotation(Math.atan2(aim.y - y, aim.x - x) + Math.PI / 2);
            else if (moving) spr.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
        } else if (side === 'def' && cat !== 'struct') {
            spr.setFlipY(true); // enemy units face down toward the attacker
        }
        const busyAttacking = spr.anims.isPlaying && spr.anims.currentAnim?.key.endsWith(':attack');
        if (aim && playAnim(spr, 'attack', true)) return;
        if (busyAttacking) return;
        if (!(moving && playAnim(spr, 'move'))) playAnim(spr, 'idle');
    }
}
