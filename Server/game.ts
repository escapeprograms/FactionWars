import { CardType, Player, Team, Coordinate, ClientGameState, Faction, PlayerArr, emptyPArr, SocketEvent } from "./types.js";
import { compArr, deepCopy, dist, doubleIt, isCoord, isInt } from "./utility.js";
import { socketTable } from "./users.js";
import { PlayerInfo } from "./player.js";
import { Building, BuildingStats } from "./building.js";
import { Unit, UnitStats } from "./unit.js";
import { withinRadius } from "./../Client/functions.js";
import b from "./../Client/buildings.json" assert { type: "json" };
import u from "./../Client/units.json" assert {type: "json"}; // See if this works or needs parsing
import c from "./../Client/cards.json" assert {type: "json"};

const buildings = b as {[key: string]: BuildingStats}; // To establish type
const units = u as {[key: string]: UnitStats};
const cards = c as {[key: string]: Card};

class GameState {
    public turn: Team = 0;
    public field: Tile[][] = []; // [0][0] is top left corner. [x] moves right, [y] moves down
    public fieldSize: number // For convenience, and assuming square fields
    public players: PlayerArr<Player> = [[], []]; // [Team0Players, Team1Players]
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
            doubleIt((i, j)=>this.field[i][j].occupy([x, y], "building"), x, y, x+building.size, y+building.size);
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
            this.field[x][y].occupy([x, y], "unit");
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
        return this.units.find(u => compArr(u.loc, c));
    }
    // Versatile but painful to use due to typing
    get(c: Coordinate, type: "unit" | "building" | "tile" | "player" | null) {
        if (type === "unit" || type === "building") return this[type + "s" as "units" | "buildings"].find(x => compArr(x.loc, c));
        else if (type === "tile" || type === "player") return this[type === "tile" ? "field" : "players"][c[0]][c[1]];
        else return null;
    }
    getOccupant(c: Coordinate) {
        return this.get(c, this.getTile(c).occupantType);
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

    move(player: Coordinate, unit: Coordinate, steps: Coordinate[]): PlayerArr<SocketEvent[]> {
        // TODO: Return double array of event arrays
        const p = this.getPlayer(player);
        const u = this.getUnit(unit);
        if (!p || p.team !== this.turn) return emptyPArr(); // Not a player or not their turn
        if (!u || !compArr(u.owner, player)) return emptyPArr(); // Not a valid unit or not their unit
        return u.move(this, steps);
    }
}

class Tile {
    // private terrain; // To be implemented later?
    // public loc: [number, number]; // Don't need that
    public occupant: Coordinate | null = null; // Coordinate of occupant or null if unoccupied
    public occupantType: "unit" | "building" | null = null;
    // For fog of war:
    // public views: [[number, number], [number, number]]; // Each number represents the number of units viewing the tile for that player
    constructor() {
        // If needed?
    }
    occupy(occupant: Coordinate, occupantType: "unit" | "building") {
        this.occupant = occupant;
        this.occupantType = occupantType;
    }
    leave() {
        this.occupant = null;
        this.occupantType = null;
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
        // TODO: Later, decide on a draw algorithm
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

/*// Returns array of all tiles that are within a given radius of a coordinate
// Coordinate should have integer values, and radius should be nonnegative
function withinRadius(c: Coordinate, r: number): Coordinate[] {
    const result: Coordinate[] = [];
    const maxY = Math.floor(r);
    for (let y = maxY; y >= -maxY; y--) {
        let maxX = Math.floor(Math.sqrt(r**2 - y**2));
        for (let x = maxX; x >= -maxX; x--) {
            result.push([c[0] + x, c[1] + y])
        }
    }
    return result;
}*/

export { GameState, Card, Deck, BuildingStats, Building, UnitStats, Unit, buildings, units, cards }; // Tile, Field