import { Coordinate, Faction, PlayerId, Unit, GameState, emptyPArr, PlayerArr, SocketEvent, Events } from "./types.js";
import { arrEqual, concatEvents, dist, doubleIt } from "./utility.js";
import { withinRadiusInBounds } from "../Client/functions.js";
import b from "./../Client/buildings.json" assert { type: "json" };

export { Building, BuildingStats, buildings};

// Add default values to buildings
const defaults: {[key: string]: any} = {
    damage: 0,
    splash: 0,
    range: 0,
    moneyGen: 0,
    energyGen: 0,
    actives: [],
    passives: [],
    attributes: [],
}

for (let key in b) {
    const building = (b as {[key: string]: {[key: string]: any}})[key];
    for (let k in defaults) {
        if (!building[k]) building[k] = defaults[k];
    }
    // TODO: Add active and passive abilities
    // TODO: Do defaults in active and passive abilities
}
const buildings = b as {[key: string]: BuildingStats & {faction: Faction}}; // To establish type

type BuildingStats  = {
    name: string,
    maxHealth: number;
    damage: number; // Attack damage, 0 for doesn't attack?
    splash: number; // splash radius, 0 for no splash/doesn't attack
    range: number; // 0 for doesn't attack normally?
    upkeep: number; // amount of energy required for upkeep
    moneyGen: number; // Money generated at the start of each turn
    energyGen: number; // Energy generated at the start of each turn
    buildTime: number; 
    size: number; // Buildings are assumed to be square
    attributes: string[];
}

class Building {
    public loc: Coordinate; // Coordinates of upper left tile
    public stats: BuildingStats;
    public owner: PlayerId; // [team, number] of player
    public health: number; // Current health
    public buildLeft: number; // Turns left for buildTime
    public active: boolean = false; // Whether the building is active or inactive (disactivated)
    public attacks = 0; // Number of times the building can attack this turn
    constructor(game: GameState, loc: Coordinate, stats: BuildingStats, player: PlayerId) {
        this.loc = loc;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
        this.buildLeft = stats.buildTime;
        // Note: Manual activation needed
    }
    // Takes in the GameState
    endTurn(game: GameState): Events {
        const ret = emptyPArr<SocketEvent>();
        // Decrement construction time
        if (this.buildLeft > 0) {
            let build = 0;
            // There's a lot of code duplication here... potentially revise?
            // Iterate above and below
            let x, y;
            if ((y = this.loc[1]-1) >= 0) {
                for (x = this.loc[0]; x < this.loc[0]+this.stats.size; x++) {
                    let unit = game.getUnit([x, y]);
                    if (unit && arrEqual(unit.owner, this.owner)) build += 2; // Refine later when we have special keywords/abilities for building
                }
            }
            if ((y = this.loc[1]+this.stats.size) < game.fieldSize) {
                for (x = this.loc[0]; x < this.loc[0]+this.stats.size; x++) {
                    let unit = game.getUnit([x, y]);
                    if (unit && arrEqual(unit.owner, this.owner)) build += 2; // Refine later when we have special keywords/abilities for building
                }
            }
            // Iterate left and right
            if ((x = this.loc[0]-1) >= 0) {
                for (y = this.loc[1]; y < this.loc[1]+this.stats.size; y++) {
                    let unit = game.getUnit([x, y]);
                    if (unit && arrEqual(unit.owner, this.owner)) build += 2; // Refine later when we have special keywords/abilities for building
                }
            }
            if ((x = this.loc[0]+this.stats.size) < game.fieldSize) {
                for (y = this.loc[1]; y < this.loc[1]+this.stats.size; y++) {
                    let unit = game.getUnit([x, y]);
                    if (unit && arrEqual(unit.owner, this.owner)) build += 2; // Refine later when we have special keywords/abilities for building
                }
            }
            
            // Do we want to send all the build ticks or just enough so that it reaches 0?
            doubleIt((i, j) => ret[i][j].push({event: "build-tick", params: [[...this.loc], build]}), 0, 0, 2, 2);
            if ((this.buildLeft -= build) <= 0) {
                this.buildLeft = 0;
                concatEvents(ret, this.activate(game));
            }
        }
        // Maybe more stuff here, such as end of turn effects, as applicable
        return ret;
    }
    startTurn(game: GameState): PlayerArr<SocketEvent[]> {
        const owner = game.getPlayer(this.owner).playerInfo!;
        const ret = emptyPArr<SocketEvent>();
        // Generate, if active
        if(this.active) {
            if (this.stats.moneyGen !== 0) {
                owner.money += this.stats.moneyGen;
                doubleIt((i, j)=>ret[i][j].push({event: "change-money", params: [[...this.owner], this.stats.moneyGen]}), 0, 0, 2, 2);
            }
            this.attacks = this.stats.damage > 0 ? 1 : 0;
            // Maybe other effects here
        }
        return ret;
    }
    // Returns whether or not it is active
    // Pass in owner's PlayerInfo
    activate(game: GameState): Events {
        const owner = game.getPlayer(this.owner).playerInfo!;
        const ret = emptyPArr<SocketEvent>();
        if (!this.active && this.buildLeft === 0 && this.stats.upkeep <= owner.energy) {
            owner.energy += this.stats.energyGen - this.stats.upkeep;
            owner.totalEnergy += this.stats.energyGen;
            this.active = true;
            doubleIt((i, j)=>ret[i][j].push(
                {event: "building-activated", params: [[...this.loc]]},
                {event: "change-energy", params: [[...this.owner], -this.stats.upkeep]},
                {event: "change-tot-energy", params: [[...this.owner], this.stats.energyGen]}
            ), 0, 0, 2, 2);
        }
        return ret;
    }
    deactivate(game: GameState): Events {
        const ret = emptyPArr<SocketEvent>();
        if (this.active) {
            const owner = game.getPlayer(this.owner).playerInfo!;
            owner.energy -= this.stats.energyGen - this.stats.upkeep;
            owner.totalEnergy -= this.stats.energyGen;
            this.active = false;
            doubleIt((i, j)=>ret[i][j].push(
                {event: "building-deactivated", params: [[...this.loc]]},
                {event: "change-energy", params: [[...this.owner], this.stats.upkeep]},
                {event: "change-tot-energy", params: [[...this.owner], -this.stats.energyGen]}
            ), 0, 0, 2, 2);
        }
        return ret;
    }
    attack(game: GameState, target: Coordinate): Events {
        const ret = emptyPArr<SocketEvent>();
        if (this.attacks < 1 || this.stats.damage === 0) return ret; // Out of attacks / Cannot attack
        if (dist(this.loc, target) > this.stats.range || arrEqual(this.loc, target)) return ret; // Out of range / Cannot attack self
        if (!game.sight(this.loc, target)) return ret; // Cannot see target
        if (this.stats.splash <= 0 && !game.getTile(target).occupant) return ret; // Non-splashers cannot attack empty tile
        doubleIt((i, j) => ret[i][j].push({event: "attack", params: [[...this.loc], [...target]]}), 0, 2, 0, 2);
        // Eventually special effects as needed
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
        const ret = emptyPArr<SocketEvent>();
        const owner = game.getPlayer(this.owner);
        // Eventually, implement on death effects (if any)
        // Remove from building list
        let i = game.buildings.findIndex(u => u.loc === this.loc);
        if (i === -1) {throw new Error("Building tried to die but was not found in game's building array");}
        game.buildings.splice(i, 1);
        // Remove from player's owned units
        let b = owner.playerInfo!.buildings;
        i = b.findIndex(c => c === this.loc);
        if (i === -1) {throw new Error("Building tried to die but was not found in player's building array");}
        b.splice(i, 1);
        // Remove from tiles
        doubleIt((i, j) => game.field[i][j].leave(), this.loc[0], this.loc[1], this.loc[0] + this.stats.size, this.loc[1] + this.stats.size);
        // Deactivate as this is no longer producing energy
        concatEvents(ret, this.deactivate(game));
        concatEvents(ret, owner.playerInfo!.upkeep(game));
        // Return events
        doubleIt((i, j) => ret[i][j].push({event: "death", params: [[...this.loc]]}), 0, 2, 0, 2);
        // Possible Headquarters destruction
        if (this.stats.name === "Headquarters") {
            owner.playerInfo!.active = false;
            doubleIt((i, j) => ret[i][j].push({event: "hq-death", params: [[...this.owner]]}), 0, 2, 0, 2);
            // Possible game end
            if (!game.getPlayer([owner.team, 1 - owner.playerInfo!.self[1]]).playerInfo!.active) {
                doubleIt((i, j) => ret[i][j].push({event: "game-end", params: [1 - owner.team]}), 0, 2, 0, 2);
                game.active = false;
                game.onGameEnd();
            }
        }
        
        //doubleIt((i, j) => ret[i][j].push({event: "game-end", params: [1-game.getPlayer(this.owner).team]}), 0, 2, 0, 2);
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
    modifyStats(game: GameState, stat: keyof BuildingStats, amount: number, modification: "set" | "change"): Events {
        // For now, only modifications to stats, and only numerical modifications, are permitted
        const ret = emptyPArr<SocketEvent>();
        if (typeof this.stats[stat] === "number") (this.stats[stat] as number) = amount + (modification === "change" ? (this.stats[stat] as number) : 0);
        doubleIt((i, j) => ret[i][j].push({event: "stat-change", params: [[...this.loc], stat, modification, amount]}), 0, 2, 0, 2);
        if (this.health > this.stats.maxHealth) {
            this.health = this.stats.maxHealth;
            doubleIt((i, j) => ret[i][j].push({event: "stat-change", params: [[...this.loc], "health", "set", this.health]}), 0, 2, 0, 2);
        }
        return ret;
    }
}