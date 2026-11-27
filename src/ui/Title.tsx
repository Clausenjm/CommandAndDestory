import { useState } from 'react';
import { FACTIONS, FactionId } from '../game/data';
import { store } from '../game/store';

export function TitleScreen() {
    const [name, setName] = useState('');
    const [faction, setFaction] = useState<FactionId | null>(null);

    return (
        <div className="title-screen">
            <div className="title-logo">
                <div className="title-main">SHARDFALL</div>
                <div className="title-sub">Frontier Command</div>
            </div>
            <p className="title-blurb">
                Crystal shards rained across the frontier, and every faction wants them. Claim a patch of wasteland, mine
                Verdite and Azurite, power up your base, and send your strike force against the raider camps around you.
            </p>
            <div className="title-step">1. Choose your faction</div>
            <div className="faction-row">
                {(Object.keys(FACTIONS) as FactionId[]).map(id => {
                    const f = FACTIONS[id];
                    return (
                        <button key={id} className={`faction-card ${faction === id ? 'chosen' : ''}`}
                            style={{ ['--fc' as string]: f.color }} onClick={() => setFaction(id)}>
                            <div className="faction-emblem">{id === 'aegis' ? '◆' : '▲'}</div>
                            <div className="faction-name">{f.name}</div>
                            <div className="faction-tag">{f.tagline}</div>
                            <div className="faction-bonus">{f.bonus}</div>
                        </button>
                    );
                })}
            </div>
            <div className="title-step">2. Name your commander</div>
            <input className="title-input" maxLength={18} placeholder="Commander" value={name}
                onChange={e => setName(e.target.value)} />
            <button className="btn primary big" disabled={!faction}
                onClick={() => faction && store.newGame(name.trim(), faction)}>
                Deploy to the Frontier
            </button>
        </div>
    );
}
