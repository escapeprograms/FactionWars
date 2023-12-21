import { CardType, Player, Team, Coordinate, ClientGameState, Faction, PlayerArr, emptyPArr, SocketEvent, Events, Lobby } from "./types.js";
import { Building, BuildingStats, Unit, UnitStats, Card, Deck } from "./types.js";
import { concatEvents, compArr, deepCopy, doubleIt, isCoord, isInt } from "./utility.js";
import { socketTable } from "./users.js";
import { PlayerInfo } from "./player.js";
import { TURN_LENGTH } from "../Client/constants.js";
import b from "./../Client/buildings.json" assert { type: "json" };
import u from "./../Client/units.json" assert {type: "json"}; // See if this works or needs parsing
import c from "./../Client/cards.json" assert {type: "json"};

export { GameState, Tile, buildings, units, cards }; // Tile, Field

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
    public turnEnd: PlayerArr<boolean> = [[false, false], [false, false]]; // Whether each player has ended their turn
    public timerID = setTimeout(()=>undefined, 1); // Id for setTimeout();
    //private lobby: () => Lobby;

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
    // Returns socket events for the building spawn
    spawnBuilding(building: BuildingStats, x:number, y:number, owner: Coordinate): Events {
        const ret = emptyPArr<SocketEvent>();
        // Verify placement
        if (this.verifyPlacement(building.size, x, y)) {
            doubleIt((i, j)=>this.field[i][j].occupy([x, y], "building"), x, y, x+building.size, y+building.size);
            this.getPlayer(owner).playerInfo!.buildings.push([x, y]); // Assumes playerinfo is not null
            const b = new Building(this, [x, y], building, owner);
            this.buildings.push(b);
            doubleIt((i, j) => ret[i][j].push({event: "building-spawn", params: [[...owner], [x, y]]}), 0, 0, 2, 2);
            // Attempt to activate building
            concatEvents(ret, b.activate(this));
        }
        return ret;
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
    verifyPlacement(size: number, x: number, y: number): boolean {
        // Assumes square field
        if (!isInt(x, 0, this.fieldSize - size) || !isInt(y, 0, this.fieldSize - size)) return false;
        
        let valid = true;
        const obj = this;
        doubleIt((i, j)=>{
            if (obj.field[i][j].occupant) valid = false;
        }, x, y, x+size, y+size);
        return valid;
    }

    endTurn(): PlayerArr<SocketEvent[]> {
        /*// Clear timer
        clearTimeout(this.timerID);*/

        const ret = emptyPArr<SocketEvent>();

        // Activate end of turn effects, as applicable
        this.buildings.forEach(b=>concatEvents(ret, b.endTurn(this)));
        this.units.forEach(u=>concatEvents(ret, u.endTurn()));
        this.turn = 1 - this.turn;

        return ret;
        // Turn start needs to be called separately
    }

    startTurn(): PlayerArr<SocketEvent[]> {
        const ret = emptyPArr<SocketEvent>();

        // Activate start of turn effects, as applicable
        this.buildings.forEach(b=>concatEvents(ret, b.startTurn(this)));
        this.units.forEach(u=>concatEvents(ret, u.startTurn()));

        // Players draw a card at the start of their turn
        this.players[this.turn].forEach(p => concatEvents(ret, p.playerInfo!.draw()));

        // Reset the team's turnEnd status
        this.turnEnd[this.turn] = this.players[this.turn].map(p=>!(p.playerInfo!.active && p.connected));

        /*// Start timer
        this.timerID = setTimeout(()=> this.endTurn(), TURN_LENGTH);*/

        return ret;
    }

    // Ends a player's turn and returns whether or not the entire turn can be ended
    end(player: Coordinate): boolean {
        if (player.every(x => isInt(x, 0, 1)) && this.getPlayer(player).team === this.turn) {
            this.turnEnd[player[0]][player[1]] = true;
            return this.turnEnd[player[0]][1-player[1]]
        }
        return false;
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
        return this.get(c, this.getTile(c).occupantType) as Building | Unit | null | undefined;
    }
    // Returns a ClientGameState for the specified client, if any
    clientCopy(player?: Coordinate): ClientGameState {
        return {
            turn: this.turn,
            field: this.field,
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
        const p = this.getPlayer(player);
        const u = this.getUnit(unit);
        if (!p || p.team !== this.turn || !p.playerInfo!.active) return emptyPArr(); // Not a player or not their turn
        if (!u || !compArr(u.owner, player)) return emptyPArr(); // Not a valid unit or not their unit
        if (steps.some(s => !s.every(x => isInt(x, 0, this.fieldSize - 1)))) return emptyPArr(); // Invalid coordinate
        return u.move(this, steps);
    }

    attack(player: Coordinate, source: Coordinate, target: Coordinate): Events {
        const p = this.getPlayer(player);
        const o = this.getOccupant(source);
        if (!p || p.team !== this.turn || !p.playerInfo!.active) return emptyPArr();
        if (!o || !compArr(o.owner, player)) return emptyPArr();
        if (compArr(source, target) || !target.every(x => isInt(x, 0, this.fieldSize - 1))) return emptyPArr(); // Invalid target coordinate
        return o.attack(this, target);
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