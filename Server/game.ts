import { CardType, Player, Team, Coordinate, ClientGameState, Faction } from "./types.js";
import { socketTable } from "./users.js";
import b from "./../Client/buildings.json" //assert { type: "json" };
import u from "./../Client/units.json" //assert {type: "json"}; // See if this works or needs parsing
import c from "./../Client/cards.json" //assert {type: "json"};

const buildings = b as {[key: string]: BuildingStats}; // To establish type
const units = u as {[key: string]: UnitStats};
const cards = c as {[key: string]: Card};

class GameState {
    public turn: Team = 0;
    public field: Tile[][] = []; // [0][0] is top left corner. [x] moves right, [y] moves down
    public fieldSize: number // For convenience, and assuming square fields
    public players: [Player[], Player[]] = [[], []]; // [Team0Players, Team1Players]
    public buildings: Building[] = []; // Contains the only references to in play buildings
    public units: Unit[] = []; // Contains the only references to in play units

    constructor (players: Player[], fieldSize=50) {
        players.forEach(p=>{
            p.playerInfo!.self = [p.team, this.players[p.team].length];
            this.players[p.team].push(p)
        });
        this.fieldSize = fieldSize;
        this.setField(fieldSize); // Spawn HQs
        this.setup(); //  Give cards to each player
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
        // Make HQs
        // TODO: Fix later: Right now, we will simply spawn HQs in the corners
        const stats: BuildingStats = buildings["hq"];
        // TODO: Fix later: Right now, assumes there is enough space for the HQs
        if (size < stats.size * 2 ) {throw new Error("field too small");}
        const obj = this;
        doubleIt((i, j) => obj.spawnBuilding(stats, i * (size - stats.size), j * (size - stats.size), [i, j]), 0, 0, 2, 2);
    }
    setup() {
        // Initialize deck and hands
        this.players.forEach(t => t.forEach(p => {
            // Eventually, make actual decks
            // Current deck is 4x Bank, 4x Power Plant, 5x Footsoldier
            const deck = p.playerInfo!.deck;
            deck.add(cards["footsoldier"] as Card, 5);
            deck.add(cards["power plant"] as Card, 4);
            deck.add(cards["bank"] as Card, 4);
            deck.shuffle();
            // Currently, players start with 5 cards in hand
            for (let i = 0; i < 5; i++) p.playerInfo!.draw();
        }))
    }

    // Spawns a building with its top left corner at (x, y)
    // Not sure what to return if invalid
    spawnBuilding(building: BuildingStats, x:number, y:number, owner: Coordinate): Building | null {
        // Verify placement
        if (this.verifyPlacement(building.size, x, y)) {
            doubleIt((i, j)=>this.field[i][j].occupant = [x, y], x, y, x+building.size, y+building.size);
            this.getPlayer(owner).playerInfo!.buildings.push([x, y]); // Assumes playerinfo is not null
            const b = new Building(this, [x, y], building, owner);
            this.buildings.push(b);
            // Maybe add stuff for build time?
            return b;
        } else  {
            return null;
        }
    }
    spawnUnit(unit: UnitStats, x:number, y:number, owner: Coordinate): Unit | null {
        if (!this.field[x][y].occupant) {
            this.getPlayer(owner).playerInfo!.units.push([x, y]);
            const u = new Unit([x, y], unit, owner);
            this.units.push(u);
            return u;
        } else {
            return null;
        }
    }

    // Verifies if a building can be placed at the specified location
    verifyPlacement(size: number, x: number, y: number):boolean {
        // Assumes square field
        if (!isInt(x, 0, this.fieldSize - size) || !isInt(y, 0, this.fieldSize - size)) return false;
        
        let valid = true;
        const obj = this;
        doubleIt((i, j)=>{
            if (obj.field[i][j].occupant) valid = false;
        }, x, y, x+size, y+size);
        return valid;
    }

    endTurn() {
        // Activate end of turn effects, as applicable
        this.buildings.forEach(b=>b.endTurn(this));
        this.units.forEach(u=>u.endTurn()); // Currently does nothing
        this.turn = 1 - this.turn;
        // call startTurn() here?
    }

    startTurn() {
        // Activate start of turn effects, as applicable
        this.buildings.forEach(b=>b.startTurn(this.getPlayer(b.owner).playerInfo!));
        this.units.forEach(u=>u.startTurn());
        // Players draw a card at the start of their turn
        this.players[this.turn].forEach(p => p.playerInfo!.draw());
        // Start timer?
    }

    getPlayer(c: Coordinate) {
        return this.players[c[0]][c[1]];
    }
    // Oh no, code duplication!?!
    getTile(c: Coordinate) {
        return this.field[c[0]][c[1]];
    }
    getBuilding(c: Coordinate) {
        return this.buildings.find(b => compArr(b.loc, c));
    }
    getUnit(c: Coordinate) {
        return this.units.find(u => compArr(u.tile, c));
    }
    // Returns a ClientGameState for the specified client, if any
    clientCopy(player?: Coordinate): ClientGameState {
        return {
            turn: this.turn,
            fieldSize: this.fieldSize,
            players: this.players.map(team=>team.map(p=>({
                id: socketTable[p.id].clientId,
                name: p.name,
                faction: p.faction,
                team: p.team,
                playerInfo: p.playerInfo!.clientCopy(player)
            }))),
            buildings: this.buildings,
            units: this.units
        };
    }
    
    /* 
     * Returns whether or not there is line of sight between the source and the target.
     * Source and Target do not block line of sight
     * Currently, all buildings and units block line of sight
     * Corners require two squares of the corner to be blocked to block line of sight
     */
    sight(source: Coordinate, target: Coordinate): boolean {
        const dx = Math.abs(target[0] - source[0]);
        const dy = Math.abs(target[1] - source[1]);
        const xdir = target[0] - source[0] > 0 ? 1 : -1; // Assumes this won't be used if it is 0
        const ydir = target[1] - source[1] > 0 ? 1 : -1; // Assumes this won't be used if it is 0
        const right = [];
        for (let x = 0.5; x < dx; x++) {
            right.push(x * dy / dx);
        }
        const up = [];
        for (let y = 0.5; y < dy; y++) {
            up.push(y);
        }
        let i = 0;
        let j = 0;
        let [x, y] = source;
        let valid = true;
        const check = () => {if (this.field[x][y].occupant && (x !== target[0] || y !== target[1])) valid = false;};
        const goHori = () => { x += xdir; i++};
        const goVert = () => { y += ydir; j++};
        while (i < right.length || j < up.length) {
            if (i === right.length) goVert();
            else if (j === up.length) goHori();
            else if (right[i] < up[j]) goHori();
            else if (right[i] > up[j]) goVert();
            else { // Corner
                if (this.field[x+xdir][y].occupant && this.field[x][y+ydir].occupant) valid = false;
                x += xdir;
                y += ydir;
                i++;
                j++;
            }
            check();
        }
        return valid;
    }
}

class Tile {
    // private terrain; // To be implemented later?
    // public loc: [number, number]; // Don't need that
    public occupant: Coordinate | null = null; // Coordinate of occupant or null if unoccupied
    constructor() {
        // If needed?
    }
}

class PlayerInfo {
    public self: Coordinate;
    public cards: Card[] = [];
    public deck: Deck = new Deck();
    public buildings: Coordinate[] = []; // Top left corners of their buildings
    public units: Coordinate[] = []; // Coordinates of their units
    public money = 0;
    public energy = 0; // Current energy available
    public totalEnergy = 0; // Total energy
    constructor(self: Coordinate) {
        this.self = self;
    }
    // Deactivates buildings until energy is nonnegative
    // Pass in game.buildings
    draw() {
        const card = this.deck.draw();
        if (!card) {console.log("No card drawn"); throw new Error("Failed to draw a card");} //TODO Fix this mechanic later
        if (this.cards.length >= 10) { // Currently, hand size is 10
            this.deck.add(card); // Immediately discard; hand is full
            console.log("Hand is full, drawn card immediately discarded");
        } else this.cards.push(card); // Add card to hand
    }
    discard(index: number): boolean {
        if (!isInt(index, 0, this.cards.length - 1)) return false;
        this.deck.add(this.cards.splice(index, 1)[0]);
        return true;
    }
    upkeep(buildings: Building[]) {
        let i = buildings.length;
        while (this.energy < 0) {
            if (compArr(this.self, buildings[--i].owner) && buildings[i].stats.upkeep > 0) {
                buildings[i].deactivate(this);
            }
        }
    }
    // Plays the card at the specified index
    // Returns true on success
    play(game: GameState, index: number, targets: {[key: string]: any}) {
        const self = game.getPlayer(this.self);
        let card: Card;
        // can only play on your turn and can only play cards that exist
        if (game.turn !== self.team || !isInt(index, 0, this.cards.length - 1)) return false;
        card = this.cards[index];
        // Check validity of targets
        if (this.validTargets(game, card, targets)) {
            card.effects.forEach(e => {
                switch(e.effect) {
                    case "spawn":
                        // Assumes e.loc is valid type, either variable or Coordinate (maybe improve later)
                        const [x, y] = (typeof(e.loc) === "string" && e.loc[0] === "$") ? targets[e.loc] : e.loc;
                        if (e.type === "unit") {
                            game.spawnUnit(units[e.id], x, y, this.self);
                            this.discard(index);
                        } else if (e.type === "building") {
                            game.spawnBuilding(buildings[e.id], x, y, this.self);
                            this.discard(index); // Discard card after playing
                        } else {
                            console.log("Spawn type invalid.");
                            throw new Error("Spawn type invalid");
                        }
                    case "gain":
                        const player = e.target === self ? this : game.getPlayer(targets[e.target]).playerInfo!; // Assumes has to be self or variable
                        if (e.type === "money") {
                            player.money += e.quantity;
                        } else {
                            console.log("Gain type invalid.");
                            throw new Error("Gain type invalid");
                        } 
                    default:
                        console.log("Unknown effect: " + e.effect);
                        throw new Error(`Effect type ${e.effect} not supported`);
                }
            });
        } else {
            // Targets invalid, cannot play
            return false;
        }

    }
    // Checks validity of card targets
    validTargets(game: GameState, card: Card, targets: {[key: string]: any}): boolean {
        if (Object.keys(targets).length !== card.targets.length) return false;
        const isCoord = (c: any, min?: number, max?: number) => Array.isArray(c) && c.length === 2 && c.every(x => isInt(x, min, max));
        card.targets.forEach((t, i) => {
            const tar = targets[t.name];
            if (!tar) return false;
            // TODO: Check the properties as well
            switch (t.type) {
                case "tile":
                    if (!isCoord(tar, 0, game.fieldSize - 1)) return false;
                    return true;
                case "unit":
                    if (!isCoord(tar, 0, game.fieldSize - 1)) return false;
                    if (!game.getUnit(tar as Coordinate)) return false;
                    return true;
                case "building":
                    if (!isCoord(tar, 0, game.fieldSize - 1)) return false;
                    if (!game.getBuilding(tar as Coordinate)) return false;
                case "player": // TODO
                    if(!isCoord(tar, 0, 1)) return false;
                    return true;
                case "choice": // Do this eventually
                default:
                    console.log("Unknown type: " + t.type);
                    throw new Error(`Target type ${t.type} not supported`);
            }
        });
        return true;
    }
    clientCopy(player?: Coordinate) {
        return {
            self: this.self,
            cards: player === this.self ? this.cards : this.cards.length,
            deck: this.deck.size,
            buildings: this.buildings,
            units: this.units,
            money: this.money,
            energy: this.energy,
            totalEnergy: this.totalEnergy
        }
    }
}

type Card = {
    name: string, // internal identifier
    faction: Faction | "N", // Faction this belongs to, or "N" for Neutral
    cardType: CardType // Building | Unit | Operation
    cost: number, // cost in money
    targets: {
        name: string, // beginning with $
        type: string, // tile/unit/building/player/card etc.
        properties: {
            [key: string]: any
        }
    }[]
    effects: {
        effect: string // name of the type of effect
        [key: string]: any
    }[]
    /* Sample effect entry:
    {
        effect: spawn
        id: string,
        loc: string,
        modifiers: {
            [key: string]: any
        }[]
    }
    */
    
}

class Deck {
    private cards: Card[] = [];
    public size = 0; // Is this needed?
    constructor() {
        // Maybe add some stuff later
    }
    shuffle() {
        let temp = -1;
        for (let i = 0; i < this.size - 1; i++) {
            temp = i + Math.floor((this.size - i) * Math.random());
            [this.cards[i], this.cards[temp]] = [this.cards[temp], this.cards[i]];
        }
    }
    add(card: Card, quantity=1, copy=false) {
        if (quantity === 1 && !copy) {
            this.cards.push(card); // Uses the card directly if quantity is 1 and copy is false
        } else {
            for (let i = 0; i < quantity; i++) this.cards.push(deepCopy(card));
        }
        this.size += quantity;
    }
    draw() {
        // TODO: Decide on a draw algorithm
        // Temporarily, we'll use each card has twice the chance of being drawn as the previous card except the last two
        if (this.size === 0) return undefined;
        let i = 0;
        let choice = Math.random();
        while(choice < 0.5 && i < this.size - 1) {
            choice *= 2;
            i++;
        }
        this.size--;
        return this.cards.splice(i, 1)[0];
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
    public tile: Coordinate;
    public stats: UnitStats;
    public owner: Coordinate; // [team, number] of player
    public health: number; // Current health
    public steps = 0; // # of steps available
    public moves = 0; // # of times left the player can move the unit
    public attacks = 0; // # of times left the unit can attack
    // Add team and/or faction property?
    constructor(tile: Coordinate, stats: UnitStats, player: Coordinate) {
        this.tile = tile;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
    }
    startTurn() {
        // Do start turn stuff here, if any
        this.steps = this.stats.speed;
        this.moves = 1;
        this.attacks = 1;
    }
    endTurn() {
        // Do end turn stuff here, if any
    }
    move(game: GameState, steps: Coordinate[]) {
        if (this.moves < 1) return; // Possibly modify this later?
        this.moves--; // Possibly modify this later?
        steps = [...steps]; // Avoid modifying parameters
        while (this.steps > 0 && steps.length > 0) {
            let step = steps[0];
            if (this.isAdj(step) && !game.getTile(step).occupant) {
                steps.shift();
                this.steps--;
                this.tile = step;
                // Add in invisible unit detection things here
            } else {
                return; // invalid step
            }
        }
    }
    isAdj(loc: Coordinate): boolean {
        return loc[0] % 1 === 0 && loc[1] % 1 === 0 && (Math.abs(loc[0] - this.tile[0]) + Math.abs(loc[1] - this.tile[1]) === 1);
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
    public loc: Coordinate; // Coordinates of upper left tile
    public stats: BuildingStats;
    public owner: Coordinate; // [team, number] of player
    public health: number; // Current health
    public buildLeft: number; // Turns left for buildTime
    public active: boolean = false; // Whether the building is active or inactive (disactivated)
    constructor(game: GameState, loc: Coordinate, stats: BuildingStats, player: Coordinate) {
        this.loc = loc;
        this.stats = stats;
        this.owner = player;
        this.health = stats.maxHealth;
        this.buildLeft = stats.buildTime;
        this.activate(game.getPlayer(player).playerInfo!);
    }
    // Takes in the GameState
    endTurn(game: GameState) {
        // Decrement construction time
        if (this.buildLeft > 0) {
            if (--this.buildLeft === 0) {
                this.activate(game.getPlayer(this.owner).playerInfo!);
            }
        }
        // Maybe more stuff here, such as end of tern effects, as applicable
    }
    startTurn(owner: PlayerInfo) {
        // Generate, if active
        if(this.active) {
            owner.money += this.stats.moneyGen;
            // Maybe other effects here
        }
    }
    // Returns whether or not it is active
    // Pass in owner's PlayerInfo
    activate(owner: PlayerInfo): boolean {
        if (!this.active && this.buildLeft === 0 && this.stats.upkeep <= owner.energy) {
            owner.energy += this.stats.energyGen - this.stats.upkeep;
            owner.totalEnergy += this.stats.energyGen;
            this.active = true;
        }
        return this.active;
    }
    // Pass in owner's PlayerInfo
    deactivate(owner: PlayerInfo) {
        if (this.active) {
            owner.energy -= this.stats.energyGen - this.stats.upkeep;
            owner.totalEnergy -= this.stats.energyGen;
            this.active = false;
        }
    }
}

function doubleIt(f: (i: number, j: number)=>void, x:number, y:number, xEnd:number, yEnd:number) {
    for (let i = x; i < xEnd; i++) {
        for (let j = y; j < yEnd; j++) {
            f(i, j);
        }
    }
}

function compArr<T>(c1: T[], c2: T[]) {
    return c1.length === c2.length && c1.every((e, i)=>e === c2[i]);
}

/*function deepCopy<T>(obj: {[key: string]: T}) {
    const copy: {[key: string]: T} = {};
    for (let p in obj) {
        copy[p] = obj[p];
    }
    return copy;
}*/
function deepCopy<T>(obj: T): T {
    if (typeof(obj === "object")) {
        const copy = {...obj};
        for (let key in copy) {
            if (typeof copy[key] === "object") {
                copy[key] = deepCopy(copy[key]);
            }
        }
        return copy;
    } else {
        return obj; // Does not work with functions and symbols
    }
}

// Given a number, returns whether or not that number is an integer
// If given min and max, also checks if the number is within that range (inclusive)
function isInt(num: number, min?: number, max?: number): boolean {
    if (num % 1 !== 0) return false;
    return (min === undefined || max === undefined) || (num >= min && num <= max);
}

export { GameState, PlayerInfo, Card, BuildingStats, UnitStats }; // Tile, Field, Unit, Building