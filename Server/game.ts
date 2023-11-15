import { CardType, Player, Team } from "./types.js";
import buildings from "./../Client/buildings.json" assert { type: "json" }; // See if this works or needs parsing
import units from "./../Client/units.json" assert {type: "json"}; // See if this works or needs parsing

class GameInfo {
    private turn: Team = 0;
    private field: Tile[][] = []; // [0][0] is top left corner. [x] moves right, [y] moves down
    private fieldSize: number // Not sure if this is necessary
    private players: Player[][] = [[], []];

    constructor (players: Player[], fieldSize=50) {
        players.forEach(p=>this.players[p.team].push(p));
        this.fieldSize = fieldSize;
        this.setField(fieldSize);
    }

    setField(size: number) {
        // Currently assuming square fields only
        // Create field
        for (let i = 0; i < size; i++) {
            const row = [];
            for (let j = 0; j < size; j++) {
                row.push(new Tile());
            }
            this.field.push(row);
        }
        console.log(this.field);
        // Make HQs
        // TODO: Fix later: Right now, we will simply spawn HQs in the corners
        const stats: BuildingStats = buildings["hq"];
        // TODO: Fix later: Right now, assumes there is enough space for the HQs
        if (size < stats.size * 2 ) {throw new Error("field too small");}
        const obj = this;
        doubleIt((i, j) => obj.spawnBuilding(stats, i * (size - stats.size), j * (size - stats.size), obj.players[i][j]), 0, 0, 1, 1);
        
    }

    // Spawns a building with its top left corner at (x, y)
    // Not sure what to return if invalid
    spawnBuilding(building: BuildingStats, x:number, y:number, owner: Player): Building | null {
        // Verify placement
        if (this.verifyPlacement(building.size, x, y)) {
            const tiles: Tile[] = [];
            const obj = this;
            doubleIt((i, j)=>tiles.push(obj.field[i][j]), x, y, x+building.size, y+building.size);
            const b = new Building(tiles, building, owner);
            owner.playerInfo!.buildings.push(b); // Assumes playerinfo is not null
            tiles.forEach(t=>t.build(b));
            // Maybe add stuff for build time?
            return b;
        } else  {
            return null;
        }
    }

    // Verifies if a building can be placed at the specified location
    verifyPlacement(size: number, x: number, y: number):boolean {
        if (x < 0 || y < 0 || x + size > this.fieldSize || y + size > this.fieldSize) { return false;}
        if (x % 1 !== 0 || y % 1 !== 0) {return false;}
        
        let valid = true;
        const obj = this;
        doubleIt((i, j)=>{
            console.log("i/j is: " + i + j);
            if (obj.field[i][j].occupied) valid = false;
        }, x, y, x+size, y+size);
        return valid;
    }

    endTurn() {
        // Activate end of turn effects, as applicable
        this.players[this.turn].forEach(p=>p.playerInfo!.buildings.forEach(b=>b.endTurn())); // Assumes playerInfo is not null
        this.turn = 1 - this.turn;
        // call startTurn() here?
    }

    startTurn() {
        // Activate start of turn effects, as applicable
        // Generate energy
        // Deactivate buildings?
        // Generate money and other effects
        // TODO
        this.players[this.turn].forEach(p=>p.playerInfo!.buildings.forEach(b=>b.startTurn())); // Assumes playerInfo is not null
        // Start timer?
    }

    // Returns a copy of the game with player socketIds replaced by clientIds
    /*clientCopy() {
        const game = new Game();
        game.players = this.players; //FIX TO BE DEEP COPY
        game.turn = this.turn;
        game.id = this.id;
        game.field = this.field;
        return game;
    }*/
}

class PlayerInfo {
    private cards: Card[] = [];
    public buildings: Building[] = [];
    private units: Unit[] = [];
    public money = 0;
    public energy = 0; // Current energy output
    constructor() {

    }
    // Deactivates buildings until energy is nonnegative
    upkeep() {
        let i = this.buildings.length;
        while (this.energy < 0) {
            if (this.buildings[--i].stats.upkeep > 0) {
                this.buildings[i].deactivate();
            }
        }
    }
}

class Card {
    private name: string
    private type: CardType
    constructor(name: string, type: CardType) {
        this.name = name;
        this.type = type;
    }
}

class Tile {
    // private terrain; // To be implemented later?
    public building: Building | null = null;
    public unit: Unit | null = null;
    public occupied = false; // Equivalent to building or unit not null
    build(b: Building) {
        this.building = b;
        this.occupied = true;
    }
}

function doubleIt(f: (i: number, j: number)=>void, x:number, y:number, xEnd:number, yEnd:number) {
    for (let i = x; i < xEnd; i++) {
        for (let j = y; j < yEnd; j++) {
            f(i, j);
        }
    }
}


type UnitStats  = {
    // Contains the stats of a unit
    maxHealth: number;
    damage: number; // Attack damage
    speed: number;
    range: number; // 1 = melee
    attributes: string[]; // Could potentially make a new type or enum for this
    // Possibly add methods for getting and changing stats
    // Possibly add methods for taking damage, dying, and other actions
}

class Unit {
    private tile: Tile;
    private stats: UnitStats;
    private owner: Player;
    private health: number; // Current health
    // Add team and/or faction property?
    constructor(tile: Tile, stats: UnitStats, player: Player) {
        this.tile = tile;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
    }
}

type BuildingStats  = {
    maxHealth: number;
    damage: number; // Attack damage, 0 for doesn't attack?
    range: number; // 0 for doesn't attack normally?
    upkeep: number; // amount of energy required for upkeep
    moneyGen: number; // Money generated at the start of each turn
    energyGen: number; // Energy generated at the start of each turn
    buildTime: number; 
    size: number; // Buildings are assumed to be square
    attributes: string[];
}

class Building {
    private tiles: Tile[];
    public stats: BuildingStats;
    private owner: Player;
    private health: number; // Current health
    private buildLeft: number; // Turns left for buildTime
    private active: boolean; // Whether the building is active or inactive (disactivated)
    constructor(tiles: Tile[], stats: BuildingStats, player: Player) {
        this.tiles = tiles;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
        this.buildLeft = stats.buildTime;
        this.active = this.buildLeft === 0;
        if (this.active && stats.energyGen > 0) {player.playerInfo!.energy += stats.energyGen;}
    }
    endTurn() {
        // Decrement construction time
        if (this.buildLeft > 0) {
            /*if(--this.buildLeft === 0 && this.owner.playerInfo!.energy >= this.stats.upkeep) {
                this.owner.playerInfo!.energy -= this.stats.upkeep;
                this.active = true;
            }*/
            this.buildLeft--;
            this.activate();
        }
        // Maybe more stuff here, as applicable
    }
    startTurn() {
        // Generate, if active
        // TODO
    }
    // Returns whether or not it is active
    activate(): boolean {
        if (!this.active && this.buildLeft === 0 && this.stats.upkeep <= this.owner.playerInfo!.energy) {
            this.owner.playerInfo!.energy += this.stats.energyGen - this.stats.upkeep;
            this.active = true;
        }
        return this.active;
    }
    deactivate() {
        if (this.active) {
            this.owner.playerInfo!.energy -= this.stats.energyGen - this.stats.upkeep;
            this.active = false;
        }
    }
}

export { GameInfo, PlayerInfo } // Card, Tile, Field, UnitStats, BuildingStats, Unit, Building