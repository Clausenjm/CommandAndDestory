import { AUTO, Game, Scale } from 'phaser';
import { Boot } from './scenes/Boot';
import { BaseScene } from './scenes/BaseScene';
import { WorldScene } from './scenes/WorldScene';
import { BattleScene } from './scenes/BattleScene';
import type { View } from './store';

const SCENE_FOR: Record<View, string> = { base: 'Base', world: 'World', battle: 'Battle' };

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#0d1014',
    audio: { noAudio: true },
    scale: { mode: Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [Boot, BaseScene, WorldScene, BattleScene],
};

const StartGame = (parent: string) => {
    const game = new Game({ ...config, parent });
    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game; // debug handle
    return game;
};

/** Stop whatever scene is running and start the one for `view`. */
export function switchView(game: Game, view: View | null) {
    const go = () => {
        const key = view ? SCENE_FOR[view] : 'Boot';
        for (const sc of game.scene.getScenes(true)) if (sc.scene.key !== key) game.scene.stop(sc.scene.key);
        if (!game.scene.isActive(key)) game.scene.start(key);
    };
    // wait until the Boot scene has finished loading sprites
    if (game.isBooted && game.registry.get('assetsReady')) go(); else game.events.once('assets-ready', go);
}

export default StartGame;
