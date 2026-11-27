// Camp layout generation + deterministic auto-battle simulation.
import { Category, Cost, ENEMIES, EnemyKind, Mult, UNITS, UnitKind } from './data';

export function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const FIELD_W = 9;
export const FIELD_H = 13;
export const ENEMY_ROWS = 5;

export interface CampObject {
    kind: EnemyKind;
    col: number;
    row: number;
    hp: number;
    dmg: number;
    loot: Cost;
}

export interface Camp {
    id: number;
    x: number;
    y: number;
    level: number;
    seed: number;
}

export function campLoot(level: number): Cost {
    const f = Math.pow(1.38, level - 1);
    return {
        verdite: Math.round(220 * f),
        azurite: Math.round(180 * f),
        credits: Math.round(90 * f),
    };
}

export function generateCampLayout(camp: Camp): CampObject[] {
    const r = rng(camp.seed);
    const L = camp.level;
    const scale = Math.pow(1.24, L - 1);
    const taken = new Set<string>();
    const objs: { kind: EnemyKind; col: number; row: number }[] = [];
    const place = (kind: EnemyKind, rowMin: number, rowMax: number) => {
        for (let tries = 0; tries < 40; tries++) {
            const col = Math.floor(r() * FIELD_W);
            const row = rowMin + Math.floor(r() * (rowMax - rowMin + 1));
            const k = col + ',' + row;
            if (!taken.has(k)) {
                taken.add(k);
                objs.push({ kind, col, row });
                return;
            }
        }
    };
    taken.add('4,0');
    objs.push({ kind: 'core', col: 4, row: 0 });
    const nBuild = 2 + Math.floor(L / 2);
    for (let i = 0; i < nBuild; i++) place(r() < 0.5 ? 'depot' : 'shack', 0, 1);
    const nTurret = Math.floor(L * 0.75);
    for (let i = 0; i < nTurret; i++) place(r() < 0.55 ? 'gunnest' : 'cannon', 1, 3);
    const nUnits = 1 + L;
    for (let i = 0; i < nUnits; i++) place(r() < 0.65 || L < 3 ? 'militia' : 'buggy', 2, 4);

    // distribute loot among loot-carrying structures, weighted by hp
    const total = campLoot(L);
    const lootObjs = objs.filter(o => ENEMIES[o.kind].loot);
    const hpSum = lootObjs.reduce((s, o) => s + ENEMIES[o.kind].hp, 0);
    return objs.map(o => {
        const def = ENEMIES[o.kind];
        const share = def.loot ? def.hp / hpSum : 0;
        const loot: Cost = {};
        for (const k of Object.keys(total) as (keyof Cost)[]) loot[k] = Math.round((total[k] ?? 0) * share);
        return { ...o, hp: Math.round(def.hp * scale), dmg: def.dmg * scale, loot };
    });
}

// ---------------------------------------------------------------- simulation
export interface Entity {
    id: number;
    side: 'att' | 'def';
    kind: UnitKind | EnemyKind;
    cat: Category;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    dmg: number;
    range: number;
    rof: number;
    speed: number;
    mult: Mult;
    cd: number;
    target: number;
    loot: Cost;
    unitId?: number;
}

export interface Shot { from: number; to: number; }
export interface Frame { pos: Float32Array; shots: Shot[]; } // pos = [x,y,hp] per entity

export interface BattleResult {
    campId: number;
    campLevel: number;
    entities: Entity[]; // initial state
    frames: Frame[];
    dt: number;
    victory: boolean;
    destroyedPct: number;
    loot: Cost;
    unitHp: Record<number, number>; // unitId -> hp fraction after battle
}

export interface AttackerInput { unitId: number; kind: UnitKind; hpFrac: number; power: number; }

export function simulate(camp: Camp, army: AttackerInput[]): BattleResult {
    const layout = generateCampLayout(camp);
    const ents: Entity[] = [];
    let id = 0;
    for (const o of layout) {
        const def = ENEMIES[o.kind];
        ents.push({
            id: id++, side: 'def', kind: o.kind, cat: def.cat,
            x: o.col + 0.5, y: o.row + 0.5, hp: o.hp, maxHp: o.hp,
            dmg: o.dmg, range: def.range, rof: def.rof, speed: 0, mult: def.mult,
            cd: def.rof * 0.5, target: -1, loot: o.loot,
        });
    }
    // deploy attackers: vehicles front row, infantry behind, spread from center
    const order = [4, 3, 5, 2, 6, 1, 7, 0, 8];
    const sorted = [...army].sort((a, b) => (UNITS[a.kind].cat === 'veh' ? 0 : 1) - (UNITS[b.kind].cat === 'veh' ? 0 : 1));
    sorted.forEach((u, i) => {
        const def = UNITS[u.kind];
        const col = order[i % 9];
        const row = Math.floor(i / 9);
        const maxHp = Math.round(def.hp * u.power);
        ents.push({
            id: id++, side: 'att', kind: u.kind, cat: def.cat,
            x: col + 0.5, y: FIELD_H - 2.5 + row * 0.9, hp: Math.max(1, maxHp * u.hpFrac), maxHp,
            dmg: def.dmg * u.power, range: def.range, rof: def.rof, speed: def.speed, mult: def.mult,
            cd: Math.random() * 0.3, target: -1, loot: {}, unitId: u.unitId,
        });
    });

    const dt = 0.1;
    const frames: Frame[] = [];
    const snap = (shots: Shot[]) => {
        const pos = new Float32Array(ents.length * 3);
        ents.forEach((e, i) => { pos[i * 3] = e.x; pos[i * 3 + 1] = e.y; pos[i * 3 + 2] = Math.max(0, e.hp); });
        frames.push({ pos, shots });
    };
    snap([]);
    const alive = (e: Entity) => e.hp > 0;
    const dist = (a: Entity, b: Entity) => Math.hypot(a.x - b.x, a.y - b.y);

    for (let t = 0; t < 120; t += dt) {
        const shots: Shot[] = [];
        const att = ents.filter(e => e.side === 'att' && alive(e));
        const def = ents.filter(e => e.side === 'def' && alive(e));
        if (att.length === 0 || def.length === 0) break;

        for (const a of att) {
            let tgt = ents[a.target];
            if (!tgt || !alive(tgt)) {
                // prefer targets in the same lane, then nearest
                let best = -1, bestScore = Infinity;
                for (const d of def) {
                    const score = Math.abs(d.x - a.x) * 1.8 + Math.abs(d.y - a.y);
                    if (score < bestScore) { bestScore = score; best = d.id; }
                }
                a.target = best;
                tgt = ents[best];
            }
            a.cd -= dt;
            const d = dist(a, tgt);
            if (d > a.range) {
                const step = Math.min(a.speed * dt, d - a.range + 0.01);
                a.x += ((tgt.x - a.x) / d) * step;
                a.y += ((tgt.y - a.y) / d) * step;
            } else if (a.cd <= 0) {
                tgt.hp -= a.dmg * a.mult[tgt.cat];
                a.cd = a.rof;
                shots.push({ from: a.id, to: tgt.id });
            }
        }
        for (const d of def) {
            if (d.dmg <= 0) continue;
            d.cd -= dt;
            if (d.cd > 0) continue;
            let best: Entity | null = null, bestD = Infinity;
            for (const a of att) {
                if (!alive(a)) continue;
                const dd = dist(a, d);
                if (dd <= d.range && dd < bestD) { bestD = dd; best = a; }
            }
            if (best) {
                best.hp -= d.dmg * d.mult[best.cat];
                d.cd = d.rof;
                shots.push({ from: d.id, to: best.id });
            }
        }
        snap(shots);
    }

    const defs = ents.filter(e => e.side === 'def');
    const totalHp = defs.reduce((s, e) => s + e.maxHp, 0);
    const lostHp = defs.reduce((s, e) => s + (e.maxHp - Math.max(0, e.hp)), 0);
    const loot: Cost = {};
    for (const e of defs) {
        if (e.hp > 0) continue;
        for (const k of Object.keys(e.loot) as (keyof Cost)[]) loot[k] = (loot[k] ?? 0) + (e.loot[k] ?? 0);
    }
    const unitHp: Record<number, number> = {};
    for (const e of ents) if (e.side === 'att' && e.unitId !== undefined) unitHp[e.unitId] = Math.max(0, e.hp) / e.maxHp;

    return {
        campId: camp.id,
        campLevel: camp.level,
        entities: ents.map((e, i) => ({ ...e, x: frames[0].pos[i * 3], y: frames[0].pos[i * 3 + 1], hp: frames[0].pos[i * 3 + 2] })),
        frames,
        dt,
        victory: ents[0].hp <= 0, // core is entity 0
        destroyedPct: Math.round((lostHp / totalHp) * 100),
        loot,
        unitHp,
    };
}
