class GameInfo {
    private turn: Team = 0;
    private field: Tile[][] = [];

    constructor (fieldSize=50) {
        this.setField(fieldSize);
    }

    setField(size: number) {
        // Currently assuming square fields only
        for (let i = 0; i < size; i++) {
            const row: Tile[] = [];
            for (let j = 0; j < size; j++) {
                row.push(new Tile());
            }
            this.field.push(row);
        }
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
    private building: Building | null = null;
    private unit: Unit | null = null;
    hasBuilding() {return this.building === null;}
    hasUnit() {return this.unit === null;}
    // Or should we just make building and unit public?
    getBuilding() {return this.building;}
    getUnit() {return this.unit;}
}

class UnitStats {
    // Contains the stats of a unit
    public maxHealth: number;
    private damage: number; // Attack damage
    private speed: number;
    private range: number; // 1 = melee
    private attributes: string[]; // Could potentially make a new type or enum for this
    constructor(maxHealth: number, damage: number, speed: number, range: number, ...attributes: string[]) {
        this.maxHealth = maxHealth;
        this.damage = damage;
        this.speed = speed;
        this.range = range;
        this.attributes = attributes;
    }
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

class BuildingStats {
    public maxHealth: number;
    private damage: number; // Attack damage, 0 for doesn't attack?
    private range: number; // 0 for doesn't attack normally?
    private upkeep: number; // amount of energy required for upkeep
    private moneyGen: number; // Money generated at the start of each turn
    private energyGen: number; // Energy generated at the start of each turn
    private buildTime: number; 
    private size: number; // Buildings are assumed to be square
    // Add passive money/energy generation properties?
    // Add attributes property?
    constructor(maxHealth: number, damage: number, range: number, upkeep: number, size=1, buildTime=1, moneyGen=0, energyGen=0) {
        this.maxHealth = maxHealth;
        this.damage = damage;
        this.range = range;
        this.upkeep = upkeep;
        this.size = size;
        this.buildTime=buildTime;
        this.moneyGen=moneyGen;
        this.energyGen=energyGen;
    }
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