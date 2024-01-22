import { withinRadiusInBounds } from "../Client/functions.js";
import { Building, Coordinate, Effect, Events, GameState, PlayerId, SocketEvent, Target, Unit, checkTargets, doEffects, emptyPArr } from "./types.js";
import { arrEqual, concatEvents, dist, doubleIt, isIntInRange } from "./utility.js";

export { ActiveAbility, JsonActiveAbility, Entity, EntityStats, processData };

interface JsonActiveAbility {
    name: string,
    targets: Target[],
    effects: Effect[],
    uses?: number // Uses per turn
}

interface ActiveAbility extends JsonActiveAbility {
    effects: Effect[];
    uses: number;
} 

interface EntityStats {
    name: string;
    maxHealth: number;
    damage: number; // Attack damage
    splash: number; // Splash radius in tiles, 0 for no splash
    range: number; // 1 = melee
    actives: ActiveAbility[];
    passives: string[];
    attributes: string[]; // Could potentially make a new type or enum for this
}

class Entity {
    public objectType: string = "Entity";
    public loc: Coordinate;
    public stats: EntityStats;
    public owner: PlayerId; // [team, number] of player
    public health: number; // Current health
    public attacks = 0; // # of times left the unit can attack
    public activeUses: number[] = []; // # of uses left this turn for each of the actives
    public modifiers: {[key: string]: any} = {};
    constructor(game: GameState, loc: Coordinate, stats: EntityStats, owner: PlayerId) {
        this.loc = loc;
        this.stats = stats;
        this.owner = owner;
        this.health = stats.maxHealth;
        for (let i = 0; i < stats.actives.length; i++) this.activeUses.push(0);
    }
    startTurn(game: GameState): Events {
        // Currently, entities that don't do damage cannot attack
        // No client event is sent for this
        this.attacks = this.stats.damage > 0 ? 1 : 0;
        this.activeUses = this.activeUses.map(_ => 1);
        return emptyPArr();
    }
    endTurn(game: GameState): Events {
        return emptyPArr();
    }
    attack(game: GameState, target: Coordinate): Events {
        const ret = emptyPArr<SocketEvent>();
        // Assumes that entites that don't do damage cannot attack
        if (this.attacks < 1 || this.stats.damage === 0) return ret; // Out of attacks / Cannot attack
        if (dist(this.loc, target) > this.stats.range || arrEqual(this.loc, target)) return ret; // Out of range / Cannot attack self
        if (!game.sight(this.loc, target)) return ret; // Cannot see target
        if (this.stats.splash <= 0 && !game.getTile(target).occupant) return ret; // Non-splashers cannot attack empty tile
        doubleIt((i, j) => ret[i][j].push({event: "attack", params: [[...this.loc], [...target]]}), 0, 0, 2, 2);
        // Eventually special effects as needed
        // NOTE: The code does not check for friendly fire!
        // Will have to adjust victim finding if field ever becomes non-square
        let victim: Unit | Building | undefined | null;
        const targeted: {[key: string]: boolean} = {};
        (withinRadiusInBounds(target, this.stats.splash, 0, 0, game.fieldSize-1, game.fieldSize-1) as Coordinate[]).forEach(v => {
            if ((victim = game.getOccupant(v)) && !targeted[victim.loc.toString()]) {
                targeted[victim.toString()] = true;
                concatEvents(ret, victim.takeDamage(game, this.stats.damage));
            }
        });
        
        this.attacks--;
        return ret;
    }
    takeDamage(game: GameState, damage: number): Events {
        // Eventually implement special abilities as necessary
        const ret = emptyPArr<SocketEvent>();
        this.health -= damage;
        doubleIt((i, j) => ret[i][j].push({event: "took-damage", params: [[...this.loc], damage]}), 0, 0, 2, 2);
        if (this.health <= 0) concatEvents(ret, this.die(game));
        return ret;
    }
    die(game: GameState): Events {
        const ret = emptyPArr<SocketEvent>();
        doubleIt((i, j) => ret[i][j].push({event: "death", params: [[...this.loc]]}), 0, 0, 2, 2);
        return ret;
    }
    heal(game: GameState, amount: number): Events {
        const ret = emptyPArr<SocketEvent>();
        const healed = Math.min(amount, this.stats.maxHealth - this.health);
        // Add possible ability triggers here
        this.health += healed;
        doubleIt((i, j)=>ret[i][j].push({event: "heal", params: [[...this.loc, amount]]},
        {event: "stat-change", params: [[...this.loc, "health", healed]]}), 0, 0, 2, 2);
        return ret;
    }
    modifyStats(game: GameState, stat: keyof EntityStats, amount: number, modification: "set" | "change"): Events {
        // For now, only modifications to stats, and only numerical modifications, are permitted
        const ret = emptyPArr<SocketEvent>();
        if (typeof this.stats[stat] === "number") (this.stats[stat] as number) = amount + (modification === "change" ? (this.stats[stat] as number) : 0);
        doubleIt((i, j) => ret[i][j].push({event: "stat-change", params: [[...this.loc], stat, modification, amount]}), 0, 0, 2, 2);
        if (this.health > this.stats.maxHealth) {
            this.health = this.stats.maxHealth;
            doubleIt((i, j) => ret[i][j].push({event: "stat-change", params: [[...this.loc], "health", "set", this.health]}), 0, 0, 2, 2);
        }
        return ret;
    }
    // Activate active ability
    useActive(game: GameState, targets: {[key: string]: any}, index: number): Events {
        const ret = emptyPArr<SocketEvent>();
        if (!isIntInRange(index, 0, this.stats.actives.length - 1)) return ret; // Ability index invalid
        const ability = this.stats.actives[index];
        if (this.activeUses[index] < 1) return ret;
        if (!checkTargets(game, this.owner, ability.targets, targets)) return ret; // Given targets invalid

        this.activeUses[index]--;
        doubleIt((i, j) => ret[i][j].push({event: "ability-use", params: [[...this.loc], index]}), 0, 0, 2, 2);
        concatEvents(ret, doEffects(game, this.owner, targets, this, ...ability.effects));

        return ret;
    }
}

// Processes the data by filling in the defaults values that are missing
// If a default value is an object or array, an empty object/array is filled in instead
// If a default value is an object and the data already has the object, the object is processed as well
// If a default value is an array and the data already has an array, any objects in the array are processed as well
// Only number/string/boolean and object/arrays are supported
function processData(data: {[key: string]: {[key: string]: any}}, defaults: {[key: string]: any}) {
    for (let key in data) processItem(data[key], defaults);
}

// defaults should match type of obj
// If obj is array, then defaults should be an array with a single element
function processItem(obj: {[key: string]: any}, defaults: {[key: string]: any}): void;
function processItem(obj: any[], defaults: any[]): void;
function processItem(obj: {[key: string]: any} | any[], defaults: {[key: string]: any} | any[]) {
    if (Array.isArray(defaults)) {
        if (defaults.length > 0 && typeof defaults[0] === "object") obj.forEach((o: {[key: string]: any}) => processItem(o, defaults[0]));
    } else {
        for (let def in defaults) {
            addDefault(obj, defaults[def], def);
        }
    }
}

// Only supports numbers, strings, booleans, objects, and arrays
function addDefault(obj: {[key:string]: any}, def: any, key: string) {
    if (typeof def === "object") {
        if (key in obj) {
            processItem(obj[key], def)
        } else {
            obj[key] = Array.isArray(def) ? [] : {};
        }
    } else {
        if (!(key in obj)) obj[key] = def;
    }
}