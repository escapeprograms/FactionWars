import { Coordinate, Faction, PlayerId, Unit, GameState, emptyPArr, PlayerArr, SocketEvent, Events, processData, EntityStats, JsonActiveAbility, Entity } from "./types.js";
import { arrEqual, concatEvents, dist, doubleIt } from "./utility.js";
import { withinRadiusInBounds } from "../Client/functions.js";
import b from "./../Client/buildings.json" assert { type: "json" };

export { Building, BuildingStats, buildings};

// Add default values to buildings
const defaults: {[key: string]: any} = {
    damage: 0,
    splash: 0,
    range: 0,
    upkeep: 0,
    moneyGen: 0,
    energyGen: 0,
    actives: [{
        uses: 1,
        effects: [{
            modifiers: {}
        }]
    }],
    passives: [],
    attributes: [],
}

// TODO: Do HQ's Industrial Might
processData(b, defaults);
const buildings = (b as {[key: string]: JsonBuilding}) as {[key: string]: BuildingStats & {faction: Faction}}; // To establish type

type JsonBuilding = {
    name: string;
    faction: Faction;
    maxHealth: number;
    damage?: number; // Attack damage
    splash?: number; // Splash radius in tiles, 0 for melee
    range?: number; // 1 = melee
    upkeep?: number; // amount of energy required for upkeep
    moneyGen?: number; // Money generated at the start of each turn
    energyGen?: number; // Energy generated at the start of each turn
    buildTime: number; 
    size: number; // Buildings are assumed to be square
    actives?: JsonActiveAbility[];
    passives?: string[];
    attributes?: string[]; // Could potentially make a new type or enum for this
}

interface BuildingStats extends EntityStats {
    upkeep: number; // amount of energy required for upkeep
    moneyGen: number; // Money generated at the start of each turn
    energyGen: number; // Energy generated at the start of each turn
    buildTime: number; 
    size: number; // Buildings are assumed to be square
}

class Building extends Entity {
    public objectType = "Building";
    public stats: BuildingStats;
    public buildLeft: number; // Turns left for buildTime
    public active: boolean = false; // Whether the building is active or inactive (disactivated)
    constructor(game: GameState, loc: Coordinate, stats: BuildingStats, owner: PlayerId) {
        super(game, loc, stats, owner);
        this.stats = stats;
        this.buildLeft = stats.buildTime;
        this.health = Math.ceil(this.stats.maxHealth / (this.stats.buildTime + 1)); // Buildings start with 1/(buildTime + 1) of their health
        // Note: Manual activation needed
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
            super.startTurn(game);
            // Maybe other effects here
        }
        return ret;
    }
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
            
            if (build > this.buildLeft) build = this.buildLeft;
            // There might be a way to simplify this? Since I'm using ceil I don't want to accidentally end up with extra health
            let healthInc = Math.ceil((this.stats.buildTime - this.buildLeft + build + 1) * this.stats.maxHealth / (this.stats.buildTime + 1))
                - Math.ceil((this.stats.buildTime - this.buildLeft + 1) * this.stats.maxHealth / (this.stats.buildTime + 1));
            if (healthInc > this.stats.maxHealth - this.health) healthInc = this.stats.maxHealth - this.health;
            this.buildLeft -= build;
            this.health += healthInc;
            // Do we want to send all the build ticks or just enough so that it reaches 0?
            // Currently sending just enough so that it reaches 0
            doubleIt((i, j) => ret[i][j].push({event: "build-tick", params: [[...this.loc], build, healthInc]}), 0, 0, 2, 2);
            if (this.buildLeft === 0) concatEvents(ret, this.activate(game));
        }
        // Maybe more stuff here, such as end of turn effects, as applicable
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
        return this.active ? super.attack(game, target) : emptyPArr();
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
        concatEvents(ret, super.die(game));
        // Possible Headquarters destruction
        if (this.stats.name === "Headquarters") {
            owner.playerInfo!.active = false;
            doubleIt((i, j) => ret[i][j].push({event: "hq-death", params: [[...this.owner]]}), 0, 0, 2, 2);
            // Possible game end
            if (!game.getPlayer([owner.team, 1 - owner.playerInfo!.self[1]]).playerInfo!.active) {
                doubleIt((i, j) => ret[i][j].push({event: "game-end", params: [1 - owner.team]}), 0, 0, 2, 2);
                game.active = false;
                game.onGameEnd();
            }
        }

        return ret;
        // There should be no more references to this unit so it can be garbage collected?
    }
}