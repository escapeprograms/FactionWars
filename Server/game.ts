const buildings = require("../../Client/buildings.json"); // require() automatically parses the json
const units = require("../../Client/units.json");

class GameInfo {
    private turn: Team = 0;
    private field!: Field; // [0][0] is top left corner. [x] moves right, [y] moves down
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
        this.field = new Field(size);
        // Make HQs
        // TODO: Fix later: Right now, we will simply spawn HQs in the corners
        const stats: BuildingStats = buildings["hq"];
        // TODO: Fix later: Right now, assumes there is enough space for the HQs
        if (size < stats.size * 2 ) {throw new Error("field too small");}
        for (let i = 0; i <= 1; i++) {
            for (let j = 0; j <= 1; j++) {
                // Team 0's HQs are at the top corners of the map, and Team 1 the bottom corners
                this.spawnBuilding(stats, i * (size - stats.size), j * (size - stats.size), this.players[i][j]);
            }
        }
        
    }

    // Spawns a building with its top left corner at (x, y)
    // Not sure what to return if invalid
    spawnBuilding(building: BuildingStats, x:number, y:number, owner: Player): Result<Building, undefined> {
        // Verify placement
        if (this.verifyPlacement(building.size, x, y)) {
            const tiles: Tile[] = [];
            this.field.iterate((i, j)=>tiles.push(this.field[i][j]), x, y, x+building.size, y+building.size);
            const b = new Building(tiles, building, owner);
            tiles.forEach(t=>t.build(b));
            // Maybe add stuff for build time?
            return success(b);
        } else  {
            return failure(undefined);
        }
    }

    // Verifies if a building can be placed at the specified location
    verifyPlacement(size: number, x: number, y: number):boolean {
        if (x < 0 || y < 0 || x + size > this.fieldSize || y + size > this.fieldSize) { return false;}
        if (x % 1 !== 0 || y % 1 !== 0) {return false;}
        
        let valid = true;
        this.field.iterate((i, j)=>{if (this.field[i][j].occupied) valid = false;}, y, x+size, y+size)
        return valid;
    }

    endTurn() {
        // Activate end of turn effects, as applicable
        this.turn = 1 - this.turn;
        // Start new turn? Activate start of turn effects?
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
    private buildings: Building[] = [];
    private units: Unit[] = [];
    constructor() {
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

class Field {
    public fieldSize: number;
    [key: number]: Tile[]

    constructor(fieldSize = 50) {
        this.fieldSize = fieldSize;
        for (let i = 0; i < fieldSize; i++) {
            const row: Tile[] = [];
            for (let j = 0; j < fieldSize; j++) {
                row.push(new Tile());
            }
            this[i] = row;
        }
    }

    iterate(f: (i: number, j: number)=>void, x:number, y:number, xEnd=this.fieldSize, yEnd=this.fieldSize) {
        for (let i = x; i < xEnd; i++) {
            for (let j = y; y < yEnd; j++) {
                f(i, j);
            }
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
    private stats: BuildingStats;
    private owner: Player;
    private health: number; // Current health
    constructor(tiles: Tile[], stats: BuildingStats, player: Player) {
        this.tiles = tiles;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
    }
}

/*let x = {
    error: true,
    type: "ur bad",
    msg: "please get gud"
}*/