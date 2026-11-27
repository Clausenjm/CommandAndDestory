import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Game } from 'phaser';
import StartGame, { switchView } from './game/main';
import { store } from './game/store';
import { TitleScreen } from './ui/Title';
import { Hud } from './ui/Hud';
import { useStore } from './ui/useStore';

let phaserGame: Game | null = null;

// load existing save once at startup
store.load();

export default function App() {
    const st = useStore();
    const gameRef = useRef<Game | null>(null);
    const inGame = !!st.state;
    const view = st.ui.view;

    // One Phaser game for the app's lifetime (avoid React StrictMode double-creation).
    useLayoutEffect(() => {
        phaserGame ??= StartGame('game-container');
        gameRef.current = phaserGame;
    }, []);

    useEffect(() => {
        if (gameRef.current) switchView(gameRef.current, inGame ? view : null);
    }, [inGame, view]);

    // economy tick
    useEffect(() => {
        let last = performance.now();
        const id = setInterval(() => {
            const now = performance.now();
            store.tick((now - last) / 1000);
            last = now;
        }, 250);
        const onUnload = () => store.save();
        window.addEventListener('beforeunload', onUnload);
        return () => { clearInterval(id); window.removeEventListener('beforeunload', onUnload); };
    }, []);

    // keyboard shortcuts
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') store.setUi({ buildKind: null, selected: null, selectedCamp: null });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <div id="app">
            <div id="game-container" />
            {inGame ? <Hud /> : <TitleScreen />}
        </div>
    );
}
