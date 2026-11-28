import { useStore } from './useStore';
import {
    ATTACK_RANGE, BUILDINGS, BUILD_ORDER, BuildingKind, CP_MAX, Cost, ENEMIES, EnemyKind, FACTIONS,
    RES_INFO, Res, UNITS, UNIT_ORDER, attackCost, buildingCost, campName,
} from '../game/data';
import { campLoot, generateCampLayout } from '../game/battle';
import { OBJECTIVES, capFor, economy, fmt, hubLevel, maxLevelFor, store, unitPower } from '../game/store';

const RES_KEYS: Res[] = ['verdite', 'azurite', 'power', 'credits'];

function Gem({ r }: { r: Res }) {
    return <span className={`gem gem-${r}`} style={{ background: RES_INFO[r].color }} />;
}

function CostView({ cost, check = true }: { cost: Cost; check?: boolean }) {
    const s = store.state!;
    return (
        <span className="cost">
            {(Object.keys(cost) as Res[]).filter(k => cost[k]).map(k => (
                <span key={k} className={check && s.res[k] < (cost[k] ?? 0) ? 'short' : ''}>
                    <Gem r={k} />{fmt(cost[k]!)}
                </span>
            ))}
        </span>
    );
}

export function Hud() {
    const st = useStore();
    const view = st.ui.view;
    return (
        <div className="hud">
            {view !== 'battle' && <TopBar />}
            {view === 'base' && <BuildBar />}
            {view !== 'battle' && <SidePanel />}
            {view === 'base' && <Tooltip />}
            {view === 'world' && <WorldHint />}
            {view === 'battle' && <BattleOverlay />}
            <Toasts />
        </div>
    );
}

function TopBar() {
    const s = store.state!;
    const e = economy(s);
    const f = FACTIONS[s.faction];
    return (
        <div className="topbar panel">
            <div className="commander" style={{ color: f.color }}>
                <div className="cmd-name">{s.name}</div>
                <div className="cmd-sub">{f.name} · Base Lv {e.baseLevel.toFixed(1)}</div>
            </div>
            <div className="res-row">
                {RES_KEYS.map(k => {
                    const cap = capFor(e, k);
                    const full = s.res[k] >= cap;
                    return (
                        <div key={k} className={`res ${full ? 'full' : ''}`} title={`${RES_INFO[k].name}${full ? ' – storage full!' : ''}`}>
                            <Gem r={k} />
                            <span className="res-val">{fmt(s.res[k])}</span>
                            {cap !== Infinity && <span className="res-cap">/ {fmt(cap)}</span>}
                            <span className="res-rate">+{fmt(e.rates[k] * 60)}/m</span>
                        </div>
                    );
                })}
                <div className="res" title="Command Points – spent to launch attacks, regenerate over time">
                    <span className="cp-icon">⚑</span>
                    <span className="res-val">{Math.floor(s.cp)}</span>
                    <span className="res-cap">/ {CP_MAX}</span>
                </div>
            </div>
            <div className="view-tabs">
                <button className={`btn ${store.ui.view === 'base' ? 'active' : ''}`}
                    onClick={() => store.setUi({ view: 'base', selectedCamp: null })}>Base</button>
                <button className={`btn ${store.ui.view === 'world' ? 'active' : ''}`}
                    onClick={() => store.setUi({ view: 'world', buildKind: null, selected: null })}>World</button>
                <button className="btn ghost" title="Delete save and start over"
                    onClick={() => { if (confirm('Abandon this base and start a new game?')) store.reset(); }}>⟲</button>
            </div>
        </div>
    );
}

function BuildBar() {
    const ui = store.ui;
    const e = economy(store.state!);
    return (
        <div className="buildbar panel">
            <div className="buildbar-head">
                <span>Construct</span>
                <span className="muted">Slots {e.slotsUsed}/{e.slotsMax}</span>
                {ui.buildKind && <span className="hint">Click a highlighted tile to place · Right-click / Esc to cancel</span>}
            </div>
            <div className="build-cards">
                {BUILD_ORDER.map(k => {
                    const lock = store.buildLockReason(k);
                    const hardLock = hubLevel(store.state!) < BUILDINGS[k].requiresHub;
                    return (
                        <button key={k} title={lock ?? BUILDINGS[k].desc}
                            className={`build-card ${ui.buildKind === k ? 'chosen' : ''} ${lock ? 'locked' : ''}`}
                            onClick={() => store.setUi({ buildKind: ui.buildKind === k ? null : k, selected: null })}>
                            <div className="bc-name">{BUILDINGS[k].name}</div>
                            <BuildingIcon kind={k} />
                            {hardLock ? <div className="bc-lock">Hub Lv {BUILDINGS[k].requiresHub}</div> : <CostView cost={buildingCost(k, 1)} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Build-bar pictures; buildings not listed here use a text glyph. */
const ICON_IMAGES: Partial<Record<BuildingKind, string>> = {
    extractor: 'assets/icons/extractor.png',
    vault: 'assets/icons/vault.png',
    hub: 'assets/icons/hub.png',
};

function BuildingIcon({ kind }: { kind: BuildingKind }) {
    const c = '#' + BUILDINGS[kind].color.toString(16).padStart(6, '0');
    const glyph: Record<BuildingKind, string> = {
        hub: '✪', extractor: '⛏', generator: 'ϟ', refinery: '¢', vault: '⬢', battery: '▮▮', barracks: '⚔', vehiclebay: '⛟',
    };
    if (kind in ICON_IMAGES) return <img className="bc-icon bc-icon-img" src={ICON_IMAGES[kind]} alt="" draggable={false} />;
    return <div className="bc-icon" style={{ color: c }}>{glyph[kind]}</div>;
}

function SidePanel() {
    const ui = store.ui;
    const tabs: [typeof ui.panel, string][] = [['info', 'Info'], ['army', 'Army'], ['goals', 'Goals']];
    return (
        <div className="sidepanel panel">
            <div className="tabs">
                {tabs.map(([k, label]) => (
                    <button key={k} className={`tab ${ui.panel === k ? 'active' : ''}`} onClick={() => store.setUi({ panel: k })}>{label}</button>
                ))}
            </div>
            <div className="panel-body">
                {ui.panel === 'info' && (ui.view === 'world' ? <CampInfo /> : <BuildingInfo />)}
                {ui.panel === 'army' && <ArmyPanel />}
                {ui.panel === 'goals' && <GoalsPanel />}
            </div>
        </div>
    );
}

function BuildingInfo() {
    const s = store.state!;
    const sel = store.ui.selected;
    const b = sel && s.grid[sel.r][sel.c].b;
    if (!sel || !b) {
        return <div className="muted pad">Select a building in your base to see its details, or pick a structure from the Construct bar below.</div>;
    }
    const def = BUILDINGS[b.kind];
    const e = economy(s);
    const te = e.tiles.find(t => t.r === sel.r && t.c === sel.c);
    const why = store.upgradeBlockReason(sel.r, sel.c);
    const max = maxLevelFor(s, b.kind);
    return (
        <div className="pad">
            <div className="h2">{def.name} <span className="lvl">Lv {b.level}</span></div>
            <div className="muted small">{def.desc}</div>
            <div className="stats">
                {te?.res && <div>Produces <Gem r={te.res} /> <b>{fmt(te.rate * 60)}</b> {RES_INFO[te.res].name}/min</div>}
                {te && te.bonusPct > 0 && <div className="good">Adjacency bonus +{te.bonusPct}%</div>}
                {b.kind === 'hub' && <>
                    <div>Build slots: <b>{e.slotsUsed}/{e.slotsMax}</b></div>
                    <div>Building level cap: <b>{b.level}</b></div>
                </>}
                {b.kind === 'vault' && <div>Crystal storage: <b>{fmt(e.capCrystal)}</b></div>}
                {b.kind === 'battery' && <div>Power storage: <b>{fmt(e.capPower)}</b></div>}
                {(b.kind === 'barracks' || b.kind === 'vehiclebay') && <div>Army supply: <b>{e.supplyUsed}/{e.supplyMax}</b></div>}
            </div>
            {b.level < max || b.kind !== 'hub' ? (
                <div className="upgrade-box">
                    <div className="small">Upgrade to Lv {b.level + 1}</div>
                    <CostView cost={buildingCost(b.kind, b.level + 1)} />
                    <button className="btn primary wide" disabled={!!why} onClick={() => store.upgrade(sel.r, sel.c)}>
                        {why ?? 'Upgrade'}
                    </button>
                </div>
            ) : <div className="muted">Max level reached.</div>}
            {b.kind !== 'hub' && (
                <button className="btn danger wide" onClick={() => { if (confirm(`Demolish ${def.name}? You get 50% of its last upgrade cost back.`)) store.sell(sel.r, sel.c); }}>
                    Demolish
                </button>
            )}
        </div>
    );
}

function ArmyPanel() {
    const s = store.state!;
    const e = economy(s);
    const repair = store.repairCost();
    const groups = UNIT_ORDER.map(k => ({ k, units: s.units.filter(u => u.kind === k) })).filter(g => g.units.length);
    return (
        <div className="pad">
            <div className="h2">Strike Force <span className="lvl">Supply {e.supplyUsed}/{e.supplyMax}</span></div>
            {e.supplyMax === 0 && <div className="warn small">Build Barracks to start training troops.</div>}
            <div className="unit-list">
                {UNIT_ORDER.map(k => {
                    const d = UNITS[k];
                    const why = store.trainBlockReason(k);
                    const p = unitPower(s, k);
                    return (
                        <div key={k} className="unit-row">
                            <div className="unit-top">
                                <b>{d.name}</b>
                                <span className="muted small">{d.cat === 'inf' ? 'Infantry' : 'Vehicle'} · {d.supply} supply</span>
                            </div>
                            <div className="muted small">{d.desc}</div>
                            <div className="small">HP {Math.round(d.hp * p)} · DMG {Math.round(d.dmg * p)} · Range {d.range}</div>
                            <div className="unit-bottom">
                                <CostView cost={d.cost} />
                                <button className="btn small-btn" disabled={!!why} title={why ?? ''} onClick={() => store.train(k)}>
                                    {why && why.startsWith('Requires') ? 'Locked' : 'Train'}
                                </button>
                            </div>
                            {why && why.startsWith('Requires') && <div className="muted tiny">{why}</div>}
                        </div>
                    );
                })}
            </div>
            <div className="h3">Deployed units</div>
            {groups.length === 0 && <div className="muted small">No units yet.</div>}
            {groups.map(g => (
                <div key={g.k} className="unit-group">
                    <div className="small"><b>{UNITS[g.k].name}</b> × {g.units.length}</div>
                    <div className="hp-chips">
                        {g.units.map(u => (
                            <span key={u.id} className="hp-chip" title={`${Math.round(u.hp * 100)}% health · click to dismiss`}
                                onClick={() => { if (confirm(`Dismiss this ${UNITS[u.kind].name}? (no refund)`)) store.dismiss(u.id); }}>
                                <span style={{ width: `${u.hp * 100}%`, background: u.hp > 0.5 ? '#5ee06a' : u.hp > 0.25 ? '#ffd84a' : '#ff5050' }} />
                            </span>
                        ))}
                    </div>
                </div>
            ))}
            {repair > 0 && (
                <button className="btn wide" onClick={() => store.repairAll()}>
                    Repair all now (<Gem r="credits" />{fmt(repair)}) — or wait, units self-repair
                </button>
            )}
        </div>
    );
}

function GoalsPanel() {
    const s = store.state!;
    return (
        <div className="pad">
            <div className="h2">Field Orders</div>
            {OBJECTIVES.map((o, i) => {
                const state = i < s.objective ? 'done' : i === s.objective ? 'current' : 'future';
                return (
                    <div key={i} className={`goal ${state}`}>
                        <span className="goal-mark">{state === 'done' ? '✔' : state === 'current' ? '➤' : '•'}</span>
                        <div>
                            <div>{o.text}</div>
                            {state !== 'done' && <div className="tiny muted">Reward: <CostView cost={o.reward} check={false} /></div>}
                        </div>
                    </div>
                );
            })}
            {s.objective >= OBJECTIVES.length && <div className="good">All orders complete. Keep expanding and crush stronger outposts!</div>}
            <div className="h3">Record</div>
            <div className="small">Battles: {s.stats.battles} · Victories: {s.stats.victories}</div>
            <div className="h3">How to play</div>
            <ul className="small muted howto">
                <li>Extractors on <span style={{ color: '#5ee06a' }}>green</span> / <span style={{ color: '#5fa8ff' }}>blue</span> fields mine crystals.</li>
                <li>Verdite builds structures; Azurite + Power train units.</li>
                <li>Place buildings next to each other for adjacency bonuses.</li>
                <li>Storage caps production – upgrade Vaults and Batteries.</li>
                <li>Attacks cost Command Points (⚑) which refill over time.</li>
                <li>Your base keeps producing while you're away (up to 8h).</li>
            </ul>
        </div>
    );
}

function CampInfo() {
    const s = store.state!;
    const camp = s.camps.find(c => c.id === store.ui.selectedCamp);
    if (!camp) return <div className="muted pad">Click a raider base on the map to scout it. Drag to pan, scroll to zoom.</div>;
    const layout = generateCampLayout(camp);
    const counts: Partial<Record<EnemyKind, number>> = {};
    layout.forEach(o => (counts[o.kind] = (counts[o.kind] ?? 0) + 1));
    const dist = Math.hypot(camp.x - s.home.x, camp.y - s.home.y);
    const why = store.attackBlockReason(camp.id);
    return (
        <div className="pad">
            <div className="h2">{campName(camp.level)} <span className="lvl">Lv {camp.level}</span></div>
            <div className="small muted">Distance {dist.toFixed(1)} (range {ATTACK_RANGE}) · Position {camp.x}:{camp.y}</div>
            <div className="h3">Scouted defenses</div>
            <div className="small">
                {(Object.keys(counts) as EnemyKind[]).map(k => <div key={k}>{ENEMIES[k].name} × {counts[k]}</div>)}
            </div>
            <div className="h3">Full loot</div>
            <CostView cost={campLoot(camp.level)} check={false} />
            <div className="tiny muted">You get loot for every structure you destroy. Destroy the Raider Core to win.</div>
            <div className="upgrade-box">
                <div className="small">Attack cost: ⚑ {attackCost(camp.level)} Command Points</div>
                <button className="btn primary wide" disabled={!!why} onClick={() => store.attack(camp.id)}>{why ?? 'Attack!'}</button>
            </div>
        </div>
    );
}

function Tooltip() {
    const ui = store.ui, s = store.state!;
    if (!ui.hover) return null;
    const t = s.grid[ui.hover.r][ui.hover.c];
    let body: React.ReactNode = null;
    if (ui.buildKind) {
        const why = store.buildBlockReason(ui.buildKind, ui.hover.r, ui.hover.c);
        body = <>
            <b>{BUILDINGS[ui.buildKind].name}</b>
            <div className={why ? 'bad' : 'good'}>{why ?? 'Click to build'}</div>
        </>;
    } else if (t.b) {
        const te = economy(s).tiles.find(x => x.r === ui.hover!.r && x.c === ui.hover!.c);
        body = <>
            <b>{BUILDINGS[t.b.kind].name} · Lv {t.b.level}</b>
            {te?.res && <div><Gem r={te.res} /> {fmt(te.rate * 60)}/min {te.bonusPct > 0 && <span className="good">(+{te.bonusPct}%)</span>}</div>}
            <div className="tiny muted">Upgrade: <CostView cost={buildingCost(t.b.kind, t.b.level + 1)} /></div>
        </>;
    } else if (t.field) {
        body = <><b><Gem r={t.field} /> {RES_INFO[t.field].name} field</b><div className="tiny muted">Build an Extractor here</div></>;
    } else return null;
    return <div className="tooltip" style={{ left: ui.hover.sx + 16, top: ui.hover.sy + 16 }}>{body}</div>;
}

function WorldHint() {
    return <div className="world-hint panel">Drag to pan · Scroll to zoom · Click a raider base to scout & attack</div>;
}

function BattleOverlay() {
    const ui = store.ui;
    const b = ui.battle;
    if (!b) return null;
    const lost = Object.values(b.unitHp).filter(h => h <= 0).length;
    return (
        <>
            <div className="battle-bar panel">
                <div className="h2">Assault on {campName(b.campLevel)} Lv {b.campLevel}</div>
                <div className="battle-controls">
                    {[1, 2, 4].map(sp => (
                        <button key={sp} className={`btn ${ui.battleSpeed === sp ? 'active' : ''}`} onClick={() => store.setUi({ battleSpeed: sp })}>{sp}×</button>
                    ))}
                    <button className="btn" onClick={() => store.setUi({ battleSkip: true })}>Skip</button>
                </div>
            </div>
            {ui.battleDone && (
                <div className="modal-back">
                    <div className={`modal panel ${b.victory ? 'win' : 'lose'}`}>
                        <div className="modal-title">{b.victory ? 'VICTORY' : 'DEFEAT'}</div>
                        <div>Base destroyed: <b>{b.destroyedPct}%</b></div>
                        <div className="h3">Loot recovered</div>
                        {Object.keys(b.loot).length ? <CostView cost={b.loot} check={false} /> : <div className="muted">Nothing</div>}
                        <div className="small muted" style={{ marginTop: 8 }}>
                            {lost > 0 ? `${lost} unit(s) knocked out – they will self-repair over time.` : 'All units survived.'}
                        </div>
                        <div className="modal-actions">
                            <button className="btn primary" onClick={() => store.setUi({ view: 'world', battle: null, battleDone: false, panel: 'info' })}>Back to World</button>
                            <button className="btn" onClick={() => store.setUi({ view: 'base', battle: null, battleDone: false, panel: 'army' })}>Return to Base</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function Toasts() {
    return (
        <div className="toasts">
            {store.ui.toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
        </div>
    );
}
