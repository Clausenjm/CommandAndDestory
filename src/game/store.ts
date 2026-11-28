// Game state, economy, actions, persistence. Shared by React (HUD) and Phaser (rendering).
import {
    ATTACK_RANGE, BUILDINGS, BuildingKind, Cost, CP_MAX, CP_REGEN_SECONDS, FACTIONS, FactionId, FieldType,
    GRID_COLS, GRID_ROWS, HUB_MAX_LEVEL, Res, UNITS, UnitKind, WORLD_SIZE, attackCost, buildingCost, campName,
} from './data';
import { BattleResult, Camp, rng, simulate } from './battle';

export interface Tile { field: FieldType | null; b: { kind: BuildingKind; level: number } | null; }
export interface Unit { id: number; kind: UnitKind; hp: number; }

export interface GameState {
    v: 1;
    name: string;
    faction: FactionId;
    res: Record<Res, number>;
    grid: Tile[][]; // [row][col]
    units: Unit[];
    nextId: number;
    cp: number;
    camps: Camp[];
    home: { x: number; y: number };
    objective: number;
    stats: { battles: number; victories: number };
    lastTime: number;
}

export type View = 'base' | 'world' | 'battle';
export type Panel = 'info' | 'army' | 'goals';

export interface UiState {
    view: View;
    panel: Panel;
    buildKind: BuildingKind | null;
    selected: { r: number; c: number } | null;
    hover: { r: number; c: number; sx: number; sy: number } | null;
    selectedCamp: number | null;
    battle: BattleResult | null;
    battleDone: boolean;
    battleSpeed: number;
    battleSkip: boolean;
    toasts: { id: number; text: string; kind: 'ok' | 'err' | 'info' }[];
}

const SAVE_KEY = 'shardfall-save-v1';

// ---------------------------------------------------------------- objectives
export interface Objective { text: string; reward: Cost; done: (s: GameState) => boolean; }
const count = (s: GameState, kind: BuildingKind, field?: FieldType) =>
    s.grid.flat().filter(t => t.b?.kind === kind && (!field || t.field === field)).length;

export const OBJECTIVES: Objective[] = [
    { text: 'Build an Extractor on a green Verdite field', reward: { verdite: 150 }, done: s => count(s, 'extractor', 'verdite') >= 1 },
    { text: 'Build a Generator', reward: { power: 150 }, done: s => count(s, 'generator') >= 1 },
    { text: 'Build an Extractor on a blue Azurite field', reward: { azurite: 150 }, done: s => count(s, 'extractor', 'azurite') >= 1 },
    { text: 'Build a Refinery next to a Generator', reward: { credits: 150 }, done: s => economy(s).tiles.some(t => t.kind === 'refinery' && t.bonusCount > 0) },
    { text: 'Build Barracks', reward: { azurite: 200, power: 100 }, done: s => count(s, 'barracks') >= 1 },
    { text: 'Train 4 Troopers', reward: { azurite: 150 }, done: s => s.units.filter(u => u.kind === 'trooper').length >= 4 },
    { text: 'Open the World map and defeat a Raider Camp', reward: { verdite: 300, credits: 200 }, done: s => s.stats.victories >= 1 },
    { text: 'Upgrade your Construction Hub to level 2', reward: { verdite: 400, power: 200 }, done: s => hubLevel(s) >= 2 },
    { text: 'Build a Vehicle Bay and train a Rover', reward: { azurite: 300 }, done: s => s.units.some(u => u.kind === 'rover') },
    { text: 'Defeat 5 raider bases', reward: { credits: 800 }, done: s => s.stats.victories >= 5 },
];

// ---------------------------------------------------------------- economy
export function hubLevel(s: GameState) {
    for (const row of s.grid) for (const t of row) if (t.b?.kind === 'hub') return t.b.level;
    return 1;
}

export interface TileEcon { r: number; c: number; kind: BuildingKind; res: Res | null; rate: number; bonusCount: number; bonusPct: number; }
export interface Economy {
    rates: Record<Res, number>;
    capCrystal: number;
    capPower: number;
    slotsUsed: number;
    slotsMax: number;
    supplyUsed: number;
    supplyMax: number;
    tiles: TileEcon[];
    baseLevel: number;
}

const neighbors = (s: GameState, r: number, c: number) => {
    const out: Tile[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const t = s.grid[r + dr]?.[c + dc];
        if (t) out.push(t);
    }
    return out;
};

export function economy(s: GameState): Economy {
    const hub = hubLevel(s);
    const rates: Record<Res, number> = { verdite: 0.25, azurite: 0.15, power: 0.25, credits: 0.1 };
    let capCrystal = 2000 + 800 * (hub - 1);
    let capPower = 2000 + 800 * (hub - 1);
    let slotsUsed = 0, supplyMax = 0, levelSum = 0, nBuild = 0;
    const tiles: TileEcon[] = [];
    const lv = (l: number) => Math.pow(1.3, l - 1);

    s.grid.forEach((row, r) => row.forEach((t, c) => {
        if (!t.b) return;
        const { kind, level } = t.b;
        levelSum += level; nBuild++;
        if (kind !== 'hub') slotsUsed++;
        const nb = neighbors(s, r, c);
        const adj = (k: BuildingKind) => nb.filter(n => n.b?.kind === k).length;
        let res: Res | null = null, rate = 0, bonusCount = 0, bonusPct = 0;
        switch (kind) {
            case 'extractor':
                res = t.field ?? 'verdite'; bonusCount = adj('vault'); bonusPct = 25 * bonusCount;
                rate = 0.35 * lv(level) * (1 + bonusPct / 100); break;
            case 'generator':
                res = 'power'; bonusCount = adj('battery'); bonusPct = 30 * bonusCount;
                rate = 0.4 * lv(level) * (1 + bonusPct / 100); break;
            case 'refinery':
                res = 'credits'; bonusCount = adj('generator'); bonusPct = 35 * bonusCount;
                rate = 0.2 * lv(level) * (1 + bonusPct / 100); break;
            case 'vault': capCrystal += Math.round(1500 * lv(level)); break;
            case 'battery': capPower += Math.round(1500 * lv(level)); break;
            case 'barracks': supplyMax += 4 + 2 * (level - 1); break;
            case 'vehiclebay': supplyMax += 3 + 2 * (level - 1); break;
        }
        if (res) rates[res] += rate;
        tiles.push({ r, c, kind, res, rate, bonusCount, bonusPct });
    }));
    if (s.faction === 'aegis') rates.power *= 1.1;
    if (s.faction === 'ember') rates.credits *= 1.1;
    const supplyUsed = s.units.reduce((n, u) => n + UNITS[u.kind].supply, 0);
    return {
        rates, capCrystal, capPower, slotsUsed, slotsMax: 5 + 2 * hub,
        supplyUsed, supplyMax, tiles, baseLevel: nBuild ? levelSum / nBuild : 1,
    };
}

export function capFor(e: Economy, r: Res) {
    return r === 'credits' ? Infinity : r === 'power' ? e.capPower : e.capCrystal;
}

export function unitPower(s: GameState, kind: UnitKind) {
    const def = UNITS[kind];
    const lvl = s.grid.flat().filter(t => t.b?.kind === def.building).reduce((m, t) => Math.max(m, t.b!.level), 0);
    return Math.pow(1.15, Math.max(0, lvl - 1));
}

/** Buildings may be upgraded up to 2 levels above the Construction Hub. */
export function maxLevelFor(s: GameState, kind: BuildingKind) {
    return kind === 'hub' ? HUB_MAX_LEVEL : hubLevel(s) + 2;
}

export function buildingLevelMax(s: GameState, kind: BuildingKind) {
    return s.grid.flat().filter(t => t.b?.kind === kind).reduce((m, t) => Math.max(m, t.b!.level), 0);
}

// ---------------------------------------------------------------- world
function makeCamp(s: GameState, r: () => number): Camp {
    for (let tries = 0; tries < 200; tries++) {
        const x = Math.floor(r() * WORLD_SIZE), y = Math.floor(r() * WORLD_SIZE);
        const d = Math.hypot(x - s.home.x, y - s.home.y);
        if (d < 3) continue;
        if (s.camps.some(c => Math.hypot(c.x - x, c.y - y) < 3)) continue;
        const level = Math.max(1, Math.min(14, 1 + Math.floor(d / 3.5) + (r() < 0.3 ? 1 : 0)));
        return { id: s.nextId++, x, y, level, seed: Math.floor(r() * 1e9) };
    }
    return { id: s.nextId++, x: 0, y: 0, level: 1, seed: 1 };
}

function newState(name: string, faction: FactionId): GameState {
    const seed = Date.now() % 1e9;
    const r = rng(seed);
    const grid: Tile[][] = Array.from({ length: GRID_ROWS }, () =>
        Array.from({ length: GRID_COLS }, () => ({ field: null, b: null } as Tile)));
    // crystal clusters
    const seedField = (type: FieldType, n: number, cr: number, cc: number) => {
        let placed = 0, guard = 0;
        while (placed < n && guard++ < 200) {
            const rr = Math.max(0, Math.min(GRID_ROWS - 1, cr + Math.round((r() - 0.5) * 4)));
            const cc2 = Math.max(0, Math.min(GRID_COLS - 1, cc + Math.round((r() - 0.5) * 4)));
            if ((rr === 3 && cc2 === 4) || grid[rr][cc2].field) continue;
            grid[rr][cc2].field = type; placed++;
        }
    };
    seedField('verdite', 4, 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 3));
    seedField('verdite', 3, 5 + Math.floor(r() * 2), 5 + Math.floor(r() * 3));
    seedField('azurite', 3, 1 + Math.floor(r() * 2), 5 + Math.floor(r() * 3));
    seedField('azurite', 3, 5 + Math.floor(r() * 2), 1 + Math.floor(r() * 3));
    grid[3][4].b = { kind: 'hub', level: 1 };

    const s: GameState = {
        v: 1, name, faction,
        res: { verdite: 600, azurite: 300, power: 300, credits: 100 },
        grid, units: [], nextId: 1, cp: 6, camps: [],
        home: { x: Math.floor(WORLD_SIZE / 2), y: Math.floor(WORLD_SIZE / 2) },
        objective: 0, stats: { battles: 0, victories: 0 }, lastTime: Date.now(),
    };
    // guarantee a few easy camps right next door
    for (const [dx, dy] of [[3, 1], [-2, 3], [1, -4]]) {
        s.camps.push({ id: s.nextId++, x: s.home.x + dx, y: s.home.y + dy, level: 1, seed: Math.floor(r() * 1e9) });
    }
    for (let i = 0; i < 34; i++) s.camps.push(makeCamp(s, r));
    return s;
}

// ---------------------------------------------------------------- store
type Listener = () => void;

class Store {
    state: GameState | null = null;
    ui: UiState = {
        view: 'base', panel: 'goals', buildKind: null, selected: null, hover: null, selectedCamp: null,
        battle: null, battleDone: false, battleSpeed: 2, battleSkip: false, toasts: [],
    };
    version = 0;
    layoutVersion = 0; // bumps when buildings/camps change (Phaser redraw)
    private listeners = new Set<Listener>();
    private toastId = 0;
    private saveTimer = 0;

    subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
    getVersion = () => this.version;
    notify(layout = false) {
        this.version++;
        if (layout) this.layoutVersion++;
        this.listeners.forEach(f => f());
    }
    setUi(patch: Partial<UiState>, layout = false) { this.ui = { ...this.ui, ...patch }; this.notify(layout); }

    toast(text: string, kind: 'ok' | 'err' | 'info' = 'info') {
        const id = ++this.toastId;
        this.setUi({ toasts: [...this.ui.toasts, { id, text, kind }].slice(-4) });
        setTimeout(() => this.setUi({ toasts: this.ui.toasts.filter(t => t.id !== id) }), 3200);
    }

    // ---- lifecycle
    load(): boolean {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return false;
            const s = JSON.parse(raw) as GameState;
            if (s.v !== 1) return false;
            this.state = s;
            const away = Math.min(8 * 3600, (Date.now() - s.lastTime) / 1000);
            if (away > 5) {
                const before = { ...s.res };
                this.tick(away);
                const gained = (Object.keys(before) as Res[])
                    .map(k => Math.floor(s.res[k] - before[k])).reduce((a, b) => a + b, 0);
                if (gained > 0) setTimeout(() => this.toast(`Welcome back! Your base produced ${gained.toLocaleString()} resources while you were away.`, 'ok'), 500);
            }
            this.notify(true);
            return true;
        } catch { return false; }
    }
    save() { if (this.state) { this.state.lastTime = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } }
    newGame(name: string, faction: FactionId) {
        this.state = newState(name || 'Commander', faction);
        this.ui = { ...this.ui, view: 'base', panel: 'goals', selected: null, buildKind: null };
        this.save();
        this.notify(true);
    }
    reset() { localStorage.removeItem(SAVE_KEY); this.state = null; this.notify(true); }

    tick(dt: number) {
        const s = this.state;
        if (!s) return;
        const e = economy(s);
        for (const k of Object.keys(s.res) as Res[]) {
            const cap = capFor(e, k);
            if (s.res[k] < cap) s.res[k] = Math.min(cap, s.res[k] + e.rates[k] * dt);
        }
        s.cp = Math.min(CP_MAX, s.cp + dt / CP_REGEN_SECONDS);
        for (const u of s.units) u.hp = Math.min(1, u.hp + dt * 0.012);
        this.checkObjective();
        this.saveTimer += dt;
        if (this.saveTimer > 5) { this.saveTimer = 0; this.save(); }
        this.notify();
    }

    private checkObjective() {
        const s = this.state!;
        const o = OBJECTIVES[s.objective];
        if (o && o.done(s)) {
            this.gain(o.reward);
            s.objective++;
            this.toast(`Objective complete: ${o.text}  (+${fmtCost(o.reward)})`, 'ok');
        }
    }

    // ---- helpers
    canAfford(cost: Cost) { const s = this.state!; return (Object.keys(cost) as Res[]).every(k => s.res[k] >= (cost[k] ?? 0)); }
    pay(cost: Cost) { const s = this.state!; for (const k of Object.keys(cost) as Res[]) s.res[k] -= cost[k] ?? 0; }
    gain(cost: Cost) {
        const s = this.state!; const e = economy(s);
        for (const k of Object.keys(cost) as Res[]) s.res[k] = Math.min(Math.max(capFor(e, k), s.res[k]), s.res[k] + (cost[k] ?? 0));
    }
    private fail(msg: string) { this.toast(msg, 'err'); return false; }

    // ---- base actions
    buildBlockReason(kind: BuildingKind, r: number, c: number): string | null {
        const s = this.state!; const t = s.grid[r]?.[c];
        const def = BUILDINGS[kind];
        if (!t) return 'Outside base';
        if (t.b) return 'Tile occupied';
        if (def.onField && !t.field) return 'Must be placed on a crystal field';
        if (!def.onField && t.field) return 'Crystal fields only hold Extractors';
        return this.buildLockReason(kind);
    }
    buildLockReason(kind: BuildingKind): string | null {
        const s = this.state!; const e = economy(s);
        if (hubLevel(s) < BUILDINGS[kind].requiresHub) return `Requires Construction Hub level ${BUILDINGS[kind].requiresHub}`;
        if (e.slotsUsed >= e.slotsMax) return 'No free build slots – upgrade the Construction Hub';
        if (!this.canAfford(buildingCost(kind, 1))) return 'Not enough resources';
        return null;
    }
    build(kind: BuildingKind, r: number, c: number) {
        const why = this.buildBlockReason(kind, r, c);
        if (why) return this.fail(why);
        this.pay(buildingCost(kind, 1));
        this.state!.grid[r][c].b = { kind, level: 1 };
        this.toast(`${BUILDINGS[kind].name} constructed`, 'ok');
        this.checkObjective();
        this.save();
        this.notify(true);
        return true;
    }
    upgradeBlockReason(r: number, c: number): string | null {
        const s = this.state!; const b = s.grid[r][c].b;
        if (!b) return 'Nothing here';
        const max = maxLevelFor(s, b.kind);
        if (b.level >= max) return b.kind === 'hub' ? 'Max level' : `Upgrade the Construction Hub first (max Lv ${max})`;
        if (!this.canAfford(buildingCost(b.kind, b.level + 1))) return 'Not enough resources';
        return null;
    }
    upgrade(r: number, c: number) {
        const why = this.upgradeBlockReason(r, c);
        if (why) return this.fail(why);
        const b = this.state!.grid[r][c].b!;
        this.pay(buildingCost(b.kind, b.level + 1));
        b.level++;
        this.toast(`${BUILDINGS[b.kind].name} upgraded to level ${b.level}`, 'ok');
        this.checkObjective();
        this.save();
        this.notify(true);
        return true;
    }
    sell(r: number, c: number) {
        const s = this.state!; const b = s.grid[r][c].b;
        if (!b || b.kind === 'hub') return this.fail('Cannot demolish this');
        const refund = buildingCost(b.kind, b.level);
        for (const k of Object.keys(refund) as Res[]) refund[k] = Math.round((refund[k] ?? 0) * 0.5);
        s.grid[r][c].b = null;
        this.gain(refund);
        this.ui = { ...this.ui, selected: null };
        this.toast(`Demolished. Refunded ${fmtCost(refund)}`, 'info');
        this.save();
        this.notify(true);
        return true;
    }

    // ---- army
    trainBlockReason(kind: UnitKind): string | null {
        const s = this.state!; const def = UNITS[kind]; const e = economy(s);
        const have = buildingLevelMax(s, def.building);
        if (have < def.reqLevel) return `Requires ${BUILDINGS[def.building].name} level ${def.reqLevel}`;
        if (e.supplyUsed + def.supply > e.supplyMax) return 'Army supply full – upgrade Barracks / Vehicle Bay';
        if (!this.canAfford(def.cost)) return 'Not enough resources';
        return null;
    }
    train(kind: UnitKind) {
        const why = this.trainBlockReason(kind);
        if (why) return this.fail(why);
        const s = this.state!;
        this.pay(UNITS[kind].cost);
        s.units.push({ id: s.nextId++, kind, hp: 1 });
        this.checkObjective();
        this.save();
        this.notify();
        return true;
    }
    dismiss(id: number) {
        const s = this.state!;
        s.units = s.units.filter(u => u.id !== id);
        this.save(); this.notify();
    }
    repairCost(): number {
        const s = this.state!;
        return Math.ceil(s.units.reduce((n, u) => n + (1 - u.hp) * ((UNITS[u.kind].cost.azurite ?? 0) * 0.4), 0));
    }
    repairAll() {
        const cost = this.repairCost();
        if (cost <= 0) return this.fail('Army is already at full health');
        if (!this.canAfford({ credits: cost })) return this.fail('Not enough Credits');
        this.pay({ credits: cost });
        this.state!.units.forEach(u => (u.hp = 1));
        this.toast('Army fully repaired', 'ok');
        this.notify();
        return true;
    }

    // ---- world / combat
    attackBlockReason(campId: number): string | null {
        const s = this.state!; const camp = s.camps.find(c => c.id === campId);
        if (!camp) return 'Target gone';
        if (Math.hypot(camp.x - s.home.x, camp.y - s.home.y) > ATTACK_RANGE) return 'Out of attack range';
        if (s.cp < attackCost(camp.level)) return 'Not enough Command Points';
        if (!s.units.some(u => u.hp > 0.05)) return 'You need combat-ready units (train some in the Army tab)';
        return null;
    }
    attack(campId: number) {
        const why = this.attackBlockReason(campId);
        if (why) return this.fail(why);
        const s = this.state!; const camp = s.camps.find(c => c.id === campId)!;
        s.cp -= attackCost(camp.level);
        const army = s.units.filter(u => u.hp > 0.05).map(u => ({ unitId: u.id, kind: u.kind, hpFrac: u.hp, power: unitPower(s, u.kind) }));
        const result = simulate(camp, army);
        // apply outcome immediately; the battle scene is a replay
        for (const u of s.units) if (result.unitHp[u.id] !== undefined) u.hp = result.unitHp[u.id];
        this.gain(result.loot);
        s.stats.battles++;
        if (result.victory) {
            s.stats.victories++;
            s.camps = s.camps.filter(c => c.id !== camp.id);
            s.camps.push(makeCamp(s, rng(Date.now() % 1e9)));
        }
        this.checkObjective();
        this.save();
        this.setUi({ view: 'battle', battle: result, battleDone: false, battleSkip: false, selectedCamp: null }, true);
        return true;
    }
}

export const store = new Store();
if (import.meta.env.DEV) (window as unknown as { store: Store }).store = store;

export function fmt(n: number) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return Math.floor(n).toLocaleString();
}
export function fmtCost(c: Cost) {
    return (Object.keys(c) as Res[]).filter(k => c[k]).map(k => `${fmt(c[k]!)} ${k[0].toUpperCase() + k.slice(1)}`).join(', ');
}
export { campName, FACTIONS };
