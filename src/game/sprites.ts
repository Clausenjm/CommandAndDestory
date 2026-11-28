// Optional sprite art. Anything listed in public/assets/sprites/manifest.json is drawn as an
// (animated) sprite; anything missing falls back to the procedural shapes in draw.ts.
import { GameObjects, Scene } from 'phaser';

export interface SheetDef {
    key: string;
    type: 'spritesheet' | 'atlas' | 'image';
    image: string; // path relative to assets/sprites/
    data?: string; // atlas JSON (type 'atlas')
    frameWidth?: number; // type 'spritesheet'
    frameHeight?: number;
}

export interface AnimDef {
    frames?: (number | string)[]; // explicit frame indices (spritesheet) or names (atlas)
    prefix?: string; // or a numbered sequence of atlas frame names: prefix + n + suffix
    suffix?: string;
    start?: number;
    end?: number;
    zeroPad?: number;
    frameRate?: number;
    repeat?: number; // -1 = loop forever (default for idle/move), 0 = play once
}

export interface ArtDef {
    sheet: string;
    frame?: string | number; // static frame when there is no idle animation
    anims?: Record<string, AnimDef>; // idle, move, attack, death
    scale?: number; // multiplier on top of "fit the tile"
    origin?: [number, number];
    offsetY?: number; // fraction of a tile, e.g. -0.1 to lift tall buildings
    rotate?: boolean; // units: turn toward where they move / shoot (art must face up)
    /** Pre-rendered facings instead of rotating: 8 frames, first facing the camera (down),
     *  then turning counter-clockwise (down-right, right, up-right, up, up-left, left, down-left). */
    directions?: (number | string)[];
}

export interface Manifest { sheets: SheetDef[]; art: Record<string, ArtDef>; }

export const MANIFEST_KEY = 'sprite-manifest';
export const SPRITE_DIR = 'assets/sprites/';
/** Terrain picture under the base grid (assets/background/). Without it the base draws plain tiles. */
export const BASE_BG = 'base-bg';

let art: Record<string, ArtDef> = {};

/** Called by the Preloader once textures are loaded. Drops entries whose sheet failed to load. */
export function registerArt(scene: Scene, manifest: Manifest) {
    art = {};
    for (const [key, def] of Object.entries(manifest.art ?? {})) {
        if (key.startsWith('_')) continue; // "_comment" style keys
        if (!scene.textures.exists(def.sheet)) {
            console.warn(`[sprites] "${key}" uses missing sheet "${def.sheet}" – using shapes instead`);
            continue;
        }
        art[key] = def;
        for (const [name, a] of Object.entries(def.anims ?? {})) {
            const animKey = `${key}:${name}`;
            if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
            const frames = a.frames
                ? a.frames.map(f => ({ key: def.sheet, frame: f }))
                : scene.anims.generateFrameNames(def.sheet, {
                    prefix: a.prefix ?? '', suffix: a.suffix ?? '', start: a.start ?? 0, end: a.end ?? 0, zeroPad: a.zeroPad ?? 0,
                });
            scene.anims.create({
                key: animKey, frames, frameRate: a.frameRate ?? 10,
                repeat: a.repeat ?? (name === 'attack' || name === 'death' ? 0 : -1),
            });
        }
    }
    const n = Object.keys(art).length;
    if (n) console.info(`[sprites] ${n} sprite(s) active: ${Object.keys(art).join(', ')}`);
}

export function artFor(key: string): ArtDef | null { return art[key] ?? null; }
export function hasAnim(key: string, name: string) { return !!art[key]?.anims?.[name]; }

/** Create a sprite for `key` centred at (x,y), fitted to a box of `size` px, playing idle. */
export function makeSprite(scene: Scene, key: string, x: number, y: number, size: number): GameObjects.Sprite | null {
    const def = art[key];
    if (!def) return null;
    const spr = scene.add.sprite(x, y, def.sheet, def.frame);
    spr.setData('art', key);
    if (def.origin) spr.setOrigin(def.origin[0], def.origin[1]);
    fitSprite(spr, size);
    playAnim(spr, 'idle');
    return spr;
}

export function fitSprite(spr: GameObjects.Sprite, size: number) {
    const def = art[spr.getData('art') as string];
    if (!def) return;
    const fw = spr.frame.realWidth || spr.width, fh = spr.frame.realHeight || spr.height;
    spr.setScale((size / Math.max(fw, fh)) * (def.scale ?? 1));
    spr.setData('offsetY', (def.offsetY ?? 0) * size);
}

/** Index into `directions` (0 = facing down, counter-clockwise) for a screen-space heading. */
export function dirIndex(dx: number, dy: number, count = 8) {
    const a = Math.atan2(dy, dx); // screen coords: down = +PI/2
    const step = (Math.PI * 2) / count;
    return (((Math.round((Math.PI / 2 - a) / step)) % count) + count) % count;
}

/** Show the pre-rendered facing for direction index `i`. Returns false if the art has no directions. */
export function setFacing(spr: GameObjects.Sprite, i: number) {
    const dirs = art[spr.getData('art') as string]?.directions;
    if (!dirs?.length) return false;
    const f = dirs[((i % dirs.length) + dirs.length) % dirs.length];
    if (spr.frame.name !== String(f)) spr.setFrame(f);
    return true;
}

/** Play an animation if this art defines it. Returns false if it doesn't. */
export function playAnim(spr: GameObjects.Sprite, name: string, restart = false) {
    const key = spr.getData('art') as string;
    if (!hasAnim(key, name)) return false;
    const animKey = `${key}:${name}`;
    if (!restart && spr.anims.currentAnim?.key === animKey && spr.anims.isPlaying) return true;
    spr.play(animKey);
    return true;
}
