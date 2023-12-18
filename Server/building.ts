import { Coordinate, Player, Unit, GameState, emptyPArr, PlayerArr, SocketEvent, Events } from "./types.js";
import { concatEvents, dist, doubleIt } from "./utility.js";
import { PlayerInfo } from "./player.js";
import { withinRadius } from "../Client/functions.js";

export { Building, BuildingStats};

type BuildingStats  = {
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
    public owner: Coordinate; // [team, number] of player
    public health: number; // Current health
    public buildLeft: number; // Turns left for buildTime
    public active: boolean = false; // Whether the building is active or inactive (disactivated)
    public attacks = 0; // Number of times the building can attack this turn
    constructor(game: GameState, loc: Coordinate, stats: BuildingStats, player: Coordinate) {
        this.loc = loc;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
        this.buildLeft = stats.buildTime;
        // this.activate(game.getPlayer(player).playerInfo!); // TODO: Manual activation needed
    }
    // Takes in the GameState
    endTurn(game: GameState): Events {
        const ret = emptyPArr<SocketEvent>();
        // Decrement construction time
        if (this.buildLeft > 0) {
            // TODO: Refine to new building mechanics
            if (--this.buildLeft === 0) {
                concatEvents(ret, this.activate(game.getPlayer(this.owner).playerInfo!));
            }
        }
        // Maybe more stuff here, such as end of tern effects, as applicable
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
    activate(owner: PlayerInfo): Events {
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
    attack(game: GameState, target: Coordinate) {
        if (this.attacks < 1 || this.stats.damage === 0) return; // Out of attacks / Cannot attack
        if (dist(this.loc, target) > this.stats.range) return; // Out of range
        if (!game.sight(this.loc, target)) return; // Cannot see target
        if (this.stats.splash <= 0 && !game.getTile(target).occupant) return; // Non-splashers cannot attack empty tile
        // Eventually special effects as needed
        // NOTE: The code does not check for friendly fire!
        // Will have to adjust victim finding if field ever becomes non-square
        let victim;
        (withinRadius(target, this.stats.splash, 0, 0, game.fieldSize-1, game.fieldSize-1) as Coordinate[]).forEach(v => {
            if (victim = game.getOccupant(v) as Unit | Building | null) victim.takeDamage(game, this.stats.damage);
        });
        
        this.attacks--;
    }
    takeDamage(game: GameState, damage: number) {
        // Eventually implement special abilities as necessary
        this.health -= damage;
        if (this.health <= 0) this.die(game);
    }
    die(game: GameState) {
        // Eventually, implement on death effects (if any)
        // Remove from building list
        let i = game.buildings.findIndex(u => u.loc === this.loc);
        if (i === -1) {throw new Error("Building tried to die but was not found in game's building array");}
        game.buildings.splice(i, 1);
        // Remove from player's owned units
        let b = game.getPlayer(this.owner).playerInfo!.buildings;
        i = b.findIndex(c => c === this.loc);
        if (i === -1) {throw new Error("Building tried to die but was not found in player's building array");}
        b.splice(i, 1);
        // Remove from tiles
        doubleIt((i, j) => game.field[i][j].leave(), this.loc[0], this.loc[1], this.loc[0] + this.stats.size, this.loc[1] + this.stats.size);
        // Deactivate as this is no longer producing energy
        this.deactivate(game);
        game.getPlayer(this.owner).playerInfo!.upkeep(game);
        // There should be no more references to this unit so it can be garbage collected?
    }
}