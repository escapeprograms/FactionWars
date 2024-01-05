import { Coordinate, Faction, PlayerId, PlayerArr, emptyPArr, SocketEvent, Events, Building, GameState, JsonEffect, Target } from "./types.js";
import { arrEqual, concatEvents, dist, doubleIt } from "./utility.js";
import { withinRadiusInBounds } from "../Client/functions.js";
import u from "./../Client/units.json" assert {type: "json"};

export {Unit, UnitStats, units};

// Add default values to units
for (let key in u) {
    const unit = (u as {[key: string]: JsonUnit})[key];
    if (!unit["actives"]) unit["actives"] = [];
    else unit.actives.forEach(ability => {
        ability.effects.forEach(effect => {
            if (!effect.modifiers) effect.modifiers = {};
        })
    })
    if (!unit["passives"]) unit["passives"] = [];
    if (!unit["attributes"]) unit["attributes"] = [];
    if (!unit["splash"]) unit["splash"] = 0;
}
const units = (u as {[key: string]: JsonUnit}) as {[key: string]: UnitStats & {faction: Faction}};

type ActiveAbility = {
    name: string,
    targets: Target[],
    effects: JsonEffect[]
}

type JsonUnit = {
    name: string;
    faction: Faction;
    maxHealth: number;
    damage: number; // Attack damage
    speed: number;
    range: number; // 1 = melee
    splash?: number; // Splash radius in tiles, 0 for melee
    actives?: ActiveAbility[];
    passives?: string[];
    attributes?: string[]; // Could potentially make a new type or enum for this
}

type UnitStats = {
    // Contains the stats of a unit
    name: string;
    maxHealth: number;
    damage: number; // Attack damage
    speed: number;
    range: number; // 1 = melee
    splash: number; // Splash radius in tiles, 0 for melee
    actives: ActiveAbility[];
    passives: string[];
    attributes: string[]; // Could potentially make a new type or enum for this
}

class Unit {
    public loc: Coordinate;
    public stats: UnitStats;
    public owner: PlayerId; // [team, number] of player
    public health: number; // Current health
    public steps = 0; // # of steps available
    public moves = 0; // # of times left the player can move the unit
    public attacks = 0; // # of times left the unit can attack
    // Add team and/or faction property?
    constructor(loc: Coordinate, stats: UnitStats, player: PlayerId) {
        this.loc = loc;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
    }
    startTurn(): PlayerArr<SocketEvent[]> {
        // Do start turn stuff here, if any
        this.steps = this.stats.speed;
        this.moves = 1;
        this.attacks = 1;
        return emptyPArr();
    }
    endTurn(): PlayerArr<SocketEvent[]> {
        // Do end turn stuff here, if any
        return emptyPArr();
    }
    move(game: GameState, steps: Coordinate[]): PlayerArr<SocketEvent[]> {
        const ret: PlayerArr<SocketEvent[]> = emptyPArr();
        if (this.moves < 1) return ret;
        this.moves--; // Possibly modify this later?
        steps = [...steps]; // Avoid modifying parameters
        while (this.steps > 0 && steps.length > 0) {
            let step = steps[0];
            if (this.isAdj(step) && !game.getTile(step).occupant) {
                steps.shift();
                this.steps--;
                // TODO: Change later with invisible unit detection and other interrupts
                // And also later implement the differences in what events are sent
                const loc = this.loc;
                doubleIt((i, j) => ret[i][j].push({event: "move", params: [[...loc], [...step]]}), 0, 2, 0, 2);
                this.loc = step;
                // Add in invisible unit detection things here
                // Adjust name in references to this unit (owner.unit, for instance)
                const u = game.getPlayer(this.owner).playerInfo!.units
                const i = u.findIndex(c => arrEqual(c, this.loc));
                if (i < 0) throw new Error("Unit not found in owner's unit array");
                u[i] = [...this.loc]; // To avoid weird things happening
            } else {
                break; // invalid step
            }
        }
        return ret;
    }
    attack(game: GameState, target: Coordinate): Events {
        const ret = emptyPArr<SocketEvent>();
        if (this.attacks < 1) return ret; // Out of attacks
        if (dist(this.loc, target) > this.stats.range || arrEqual(this.loc, target)) return ret; // Out of range / Cannot attack self
        if (!game.sight(this.loc, target)) return ret; // Cannot see target
        if (this.stats.splash <= 0 && !game.getTile(target).occupant) return ret; // Non-splashers cannot attack empty tile
        doubleIt((i, j) => ret[i][j].push({event: "attack", params: [[...this.loc], [...target]]}), 0, 2, 0, 2);
        // Eventually add special effects as needed
        // NOTE: The code does not check for friendly fire!
        // Will have to adjust victim finding if field ever becomes non-square
        let victim;
        (withinRadiusInBounds(target, this.stats.splash, 0, 0, game.fieldSize-1, game.fieldSize-1) as Coordinate[]).forEach(v => {
            if (victim = game.getOccupant(v) as Unit | Building | null) concatEvents(ret, victim.takeDamage(game, this.stats.damage));
        });
        
        this.attacks--;
        return ret;
    }
    takeDamage(game: GameState, damage: number): Events {
        // Eventually implement special abilities as necessary
        const ret = emptyPArr<SocketEvent>();
        this.health -= damage;
        doubleIt((i, j) => ret[i][j].push({event: "took-damage", params: [[...this.loc], damage]}), 0, 2, 0, 2);
        if (this.health <= 0) concatEvents(ret, this.die(game));
        return ret;
    }
    die(game: GameState): Events {
        // Eventually, implement on death effects (if any)
        // Remove from unit list
        let i = game.units.findIndex(u => u.loc === this.loc);
        if (i === -1) {throw new Error("Unit tried to die but was not found in game's unit array");}
        game.units.splice(i, 1);
        // Remove from player's owned units
        let u = game.getPlayer(this.owner).playerInfo!.units;
        i = u.findIndex(c => c === this.loc);
        if (i === -1) {throw new Error("Unit tried to die but was not found in player's unit array");}
        u.splice(i, 1);
        // Remove from tile
        game.getTile(this.loc).leave();
        // Return events
        const ret = emptyPArr<SocketEvent>();
        doubleIt((i, j) => ret[i][j].push({event: "death", params: [[...this.loc]]}), 0, 2, 0, 2);
        return ret;
        // There should be no more references to this unit so it can be garbage collected?
    }
    heal(game: GameState, amount: number): Events {
        const ret = emptyPArr<SocketEvent>();
        const healed = Math.min(amount, this.stats.maxHealth - this.health);
        // Add possible ability triggers here
        this.health += healed;
        doubleIt((i, j)=>ret[i][j].push({event: "heal", params: [[...this.loc, amount]]},
        {event: "stat-change", params: [[...this.loc, "health", healed]]}),0,0,2,2);
        return ret;
    }
    isAdj(loc: Coordinate): boolean {
        return loc[0] % 1 === 0 && loc[1] % 1 === 0 && (Math.abs(loc[0] - this.loc[0]) + Math.abs(loc[1] - this.loc[1]) === 1);
    }
}