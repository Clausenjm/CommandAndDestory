import { Scene } from 'phaser';
import { BASE_BG, MANIFEST_KEY, Manifest, SPRITE_DIR, registerArt } from '../sprites';

/**
 * First scene: loads the optional sprite manifest and every sheet it lists, registers
 * animations, then idles until the player enters the game. A missing manifest is fine.
 */
export class Boot extends Scene {
    constructor() { super('Boot'); }

    preload() {
        this.cameras.main.setBackgroundColor(0x0d1014);
        this.load.setPath(SPRITE_DIR);
        this.load.once(`filecomplete-json-${MANIFEST_KEY}`, (_key: string, _type: string, data: Manifest) => {
            for (const s of data?.sheets ?? []) {
                if (s.type === 'atlas' && s.data) this.load.atlas(s.key, s.image, s.data);
                else if (s.type === 'spritesheet') this.load.spritesheet(s.key, s.image, { frameWidth: s.frameWidth ?? 64, frameHeight: s.frameHeight ?? s.frameWidth ?? 64 });
                else this.load.image(s.key, s.image);
            }
        });
        this.load.on('loaderror', (file: { key: string; src: string }) => console.warn(`[sprites] could not load ${file.src}`));
        this.load.json(MANIFEST_KEY, 'manifest.json');
        this.load.image(BASE_BG, '../background/Barren Sci-Fi Desert Terrain Map.png');
    }

    create() {
        const manifest = this.cache.json.get(MANIFEST_KEY) as Manifest | undefined;
        if (manifest) registerArt(this, manifest);
        this.game.registry.set('assetsReady', true);
        this.game.events.emit('assets-ready');
    }
}
