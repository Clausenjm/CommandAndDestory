// Static game data: resources, buildings, units, enemy structures.
// All numbers are tuned for a fast prototype (rates are per second).

export type Res = 'verdite' | 'azurite' | 'power' | 'credits';
export type Cost = Partial<Record<Res, number>>;
export type FieldType = 'verdite' | 'azurite';

export const RES_INFO: Record<Res, { name: string; color: string; hex: number }> = {
    verdite: { name: 'Verdite', color: '#5ee06a', hex: 0x5ee06a },
    azurite: { name: 'Azurite', color: '#5fa8ff', hex: 0x5fa8ff },
    power: { name: 'Power', color: '#ffd84a', hex: 0xffd84a },
    credits: { name: 'Credits', color: '#e9eef5', hex: 0xe9eef5 },
};

export const GRID_COLS = 9;
export const GRID_ROWS = 8;

// ---------------------------------------------------------------- factions
export type FactionId = 'aegis' | 'ember';
export const FACTIONS: Record<FactionId, { name: string; tagline: string; color: string; hex: number; bonus: string }> = {
    aegis: {
        name: 'Aegis Directorate',
        tagline: 'Disciplined frontier engineers who fortify every crystal field they claim.',
        color: '#3fb6ff',
        hex: 0x3fb6ff,
        bonus: '+10% Power production',
    },
    ember: {
        name: 'Ember Syndicate',
        tagline: 'Fast-moving salvage crews who turn raw shards into hard currency.',
        color: '#ff6a3d',
        hex: 0xff6a3d,
        bonus: '+10% Credit production',
    },
};

// ---------------------------------------------------------------- buildings
export type BuildingKind =
    | 'hub' | 'extractor' | 'generator' | 'refinery'
    | 'vault' | 'battery' | 'barracks' | 'vehiclebay';

export interface BuildingDef {
    kind: BuildingKind;
    name: string;
    desc: string;
    baseCost: Cost;
    growth: number;
    color: number;
    requiresHub: number;
    unique?: boolean;
    onField?: boolean; // must be placed on a crystal field
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
    hub: {
        kind: 'hub', name: 'Construction Hub', growth: 1.7, color: 0x8fa3b8, requiresHub: 99, unique: true,
        desc: 'Heart of your base. Raises max building level, build slots and storage.',
        baseCost: { verdite: 250, power: 150 },
    },
    extractor: {
        kind: 'extractor', name: 'Extractor', growth: 1.5, color: 0xc9a227, requiresHub: 1, onField: true,
        desc: 'Mines the crystal field it sits on. +25% per adjacent Vault.',
        baseCost: { verdite: 60, power: 15 },
    },
    generator: {
        kind: 'generator', name: 'Generator', growth: 1.5, color: 0xe0b100, requiresHub: 1,
        desc: 'Produces Power. +30% per adjacent Battery.',
        baseCost: { verdite: 80 },
    },
    refinery: {
        kind: 'refinery', name: 'Refinery', growth: 1.5, color: 0x9aa7b4, requiresHub: 1,
        desc: 'Produces Credits. +35% per adjacent Generator.',
        baseCost: { verdite: 120, power: 60 },
    },
    vault: {
        kind: 'vault', name: 'Crystal Vault', growth: 1.5, color: 0x55b08a, requiresHub: 1,
        desc: 'Raises Verdite & Azurite storage. Boosts adjacent Extractors.',
        baseCost: { verdite: 100, power: 40 },
    },
    battery: {
        kind: 'battery', name: 'Battery Bank', growth: 1.5, color: 0xd6c25a, requiresHub: 1,
        desc: 'Raises Power storage. Boosts adjacent Generators.',
        baseCost: { verdite: 100, power: 40 },
    },
    barracks: {
        kind: 'barracks', name: 'Barracks', growth: 1.55, color: 0x7d8f5a, requiresHub: 1,
        desc: 'Trains infantry and adds army supply. Higher levels make infantry stronger.',
        baseCost: { verdite: 200, power: 100 },
    },
    vehiclebay: {
        kind: 'vehiclebay', name: 'Vehicle Bay', growth: 1.55, color: 0x6d7f99, requiresHub: 2,
        desc: 'Builds vehicles and adds army supply. Higher levels make vehicles stronger.',
        baseCost: { verdite: 350, power: 200 },
    },
};

export const BUILD_ORDER: BuildingKind[] = [
    'extractor', 'generator', 'refinery', 'vault', 'battery', 'barracks', 'vehiclebay',
];

export const HUB_MAX_LEVEL = 15;

export function roundCost(n: number) {
    return n < 100 ? Math.round(n) : Math.round(n / 5) * 5;
}

/** Cost to reach `level` (1 = initial construction). */
export function buildingCost(kind: BuildingKind, level: number): Cost {
    const def = BUILDINGS[kind];
    const out: Cost = {};
    const f = Math.pow(def.growth, level - 1);
    for (const k of Object.keys(def.baseCost) as Res[]) {
        out[k] = roundCost((def.baseCost[k] ?? 0) * f);
    }
    return out;
}

// ---------------------------------------------------------------- combat
export type Category = 'inf' | 'veh' | 'struct';
export type Mult = Record<Category, number>;

export type UnitKind = 'trooper' | 'lancer' | 'rover' | 'breaker';

export interface UnitDef {
    kind: UnitKind;
    name: string;
    desc: string;
    cat: 'inf' | 'veh';
    hp: number;
    dmg: number;
    range: number; // tiles
    rof: number; // seconds between shots
    speed: number; // tiles / s
    mult: Mult;
    cost: Cost;
    supply: number;
    building: 'barracks' | 'vehiclebay';
    reqLevel: number;
}

export const UNITS: Record<UnitKind, UnitDef> = {
    trooper: {
        kind: 'trooper', name: 'Trooper', desc: 'Cheap rifle squad. Good against infantry.',
        cat: 'inf', hp: 100, dmg: 12, range: 2.2, rof: 1.0, speed: 1.0,
        mult: { inf: 1.5, veh: 0.4, struct: 0.9 },
        cost: { azurite: 40, power: 20 }, supply: 1, building: 'barracks', reqLevel: 1,
    },
    lancer: {
        kind: 'lancer', name: 'Lancer', desc: 'Rocket team. Shreds vehicles, weak to infantry.',
        cat: 'inf', hp: 80, dmg: 20, range: 3.2, rof: 1.4, speed: 0.9,
        mult: { inf: 0.5, veh: 1.7, struct: 0.9 },
        cost: { azurite: 70, power: 40 }, supply: 1, building: 'barracks', reqLevel: 2,
    },
    rover: {
        kind: 'rover', name: 'Rover', desc: 'Fast gun buggy. Mows down infantry.',
        cat: 'veh', hp: 240, dmg: 14, range: 2.6, rof: 0.7, speed: 1.8,
        mult: { inf: 1.7, veh: 0.6, struct: 0.5 },
        cost: { azurite: 110, power: 70 }, supply: 2, building: 'vehiclebay', reqLevel: 1,
    },
    breaker: {
        kind: 'breaker', name: 'Breaker Tank', desc: 'Heavy siege tank. Smashes structures.',
        cat: 'veh', hp: 420, dmg: 40, range: 3.6, rof: 1.8, speed: 0.7,
        mult: { inf: 0.5, veh: 1.3, struct: 1.8 },
        cost: { azurite: 220, power: 140 }, supply: 3, building: 'vehiclebay', reqLevel: 3,
    },
};

export const UNIT_ORDER: UnitKind[] = ['trooper', 'lancer', 'rover', 'breaker'];

export type EnemyKind = 'core' | 'depot' | 'shack' | 'gunnest' | 'cannon' | 'militia' | 'buggy';

export interface EnemyDef {
    kind: EnemyKind;
    name: string;
    cat: Category;
    hp: number;
    dmg: number;
    range: number;
    rof: number;
    mult: Mult;
    loot: boolean; // structures carry loot
}

const NO_MULT: Mult = { inf: 0, veh: 0, struct: 0 };

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
    core: { kind: 'core', name: 'Raider Core', cat: 'struct', hp: 600, dmg: 0, range: 0, rof: 1, mult: NO_MULT, loot: true },
    depot: { kind: 'depot', name: 'Loot Depot', cat: 'struct', hp: 350, dmg: 0, range: 0, rof: 1, mult: NO_MULT, loot: true },
    shack: { kind: 'shack', name: 'Scrap Shack', cat: 'struct', hp: 250, dmg: 0, range: 0, rof: 1, mult: NO_MULT, loot: true },
    gunnest: { kind: 'gunnest', name: 'Gun Nest', cat: 'struct', hp: 300, dmg: 8, range: 3.0, rof: 0.8, mult: { inf: 1.6, veh: 0.4, struct: 0 }, loot: true },
    cannon: { kind: 'cannon', name: 'Scrap Cannon', cat: 'struct', hp: 380, dmg: 26, range: 3.8, rof: 1.6, mult: { inf: 0.4, veh: 1.6, struct: 0 }, loot: true },
    militia: { kind: 'militia', name: 'Raider Militia', cat: 'inf', hp: 90, dmg: 9, range: 2.4, rof: 1.0, mult: { inf: 1.4, veh: 0.5, struct: 0 }, loot: false },
    buggy: { kind: 'buggy', name: 'Raider Buggy', cat: 'veh', hp: 200, dmg: 12, range: 2.6, rof: 0.8, mult: { inf: 1.5, veh: 0.7, struct: 0 }, loot: false },
};

export function campName(level: number) {
    if (level >= 9) return 'Raider Fortress';
    if (level >= 5) return 'Raider Outpost';
    return 'Raider Camp';
}

export function attackCost(level: number) {
    return 1 + Math.ceil(level / 3);
}

export const CP_MAX = 12;
export const CP_REGEN_SECONDS = 20;
export const ATTACK_RANGE = 9;
export const WORLD_SIZE = 50;
