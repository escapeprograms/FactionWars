import { Coordinate, PlayerId, Events, SocketEvent, Card, Deck, GameState,emptyPArr, play } from "./types.js";
import { arrEqual, concatEvents, doubleIt, isIntInRange } from "./utility.js";
import { MAX_HAND_SIZE } from "../Client/constants.js";

export class PlayerInfo {
    public self: PlayerId;
    public cards: Card[] = [];
    public deck: Deck = new Deck();
    public buildings: Coordinate[] = []; // Top left corners of their buildings
    public units: Coordinate[] = []; // Coordinates of their units
    public money = 0;
    public energy = 0; // Current energy available
    public totalEnergy = 0; // Total energy
    public active = true; // Becomes false if they lose their HQ or disconnect
    constructor(self: PlayerId) {
        this.self = self;
    }
    draw(): Events {
        const ret = emptyPArr<SocketEvent>();
        const card = this.deck.draw();
        if (!card) {console.log("No card drawn"); return ret;} // Potentially change later, but for now, the draw just fails
        doubleIt((i, j) => 
            ret[i][j].push({event: "card-drawn", params: (i === this.self[0] && j === this.self[1] ? [[...this.self], card] : [[...this.self]])}), 
        0, 0, 2, 2);
        this.cards.push(card); // Add card to hand
        if (this.cards.length > MAX_HAND_SIZE) {
            concatEvents(ret, this.discard(this.cards.length - 1)); // Immediately discard; hand is full
            console.log("Hand is full, drawn card immediately discarded");
        }
        return ret;
    }
    discard(index: number): Events {
        const ret = emptyPArr<SocketEvent>();
        if (!isIntInRange(index, 0, this.cards.length - 1)) return ret; // Invalid discard
        this.deck.add(this.cards.splice(index, 1)[0]);
        doubleIt((i, j) => ret[i][j].push({event: "card-discarded", params: [...this.self, index]}), 0, 0, 2, 2);
        return ret;
    }
    // Deactivates buildings until energy is nonnegative
    // Pass in game
    upkeep(game: GameState): Events {
        const ret = emptyPArr<SocketEvent>();
        const buildings = game.buildings;
        let i = buildings.length;
        while (this.energy < 0) {
            if (arrEqual(this.self, buildings[--i].owner) && buildings[i].stats.upkeep > 0) {
                concatEvents(ret, buildings[i].deactivate(game));
            }
        }
        return ret;
    }
    // Plays the card at the specified index
    // Returns true on success
    play(game: GameState, index: number, targets: {[key: string]: any}): Events {
        //const self = game.get(this.self, "player") as Player; //
        const self = game.getPlayer(this.self);
        const ret = emptyPArr<SocketEvent>();
        // can only play on your turn and can only play cards that exist
        if (game.turn === self.team && isIntInRange(index, 0, this.cards.length - 1)) {
            concatEvents(ret, play(game, this.self, index, targets));
        }
        return ret;
    }
    // Checks validity of card targets
    validTargets(game: GameState, card: Card, targets: {[key: string]: any}): boolean {
        if (Object.keys(targets).length !== card.targets.length) return false;
        const isCoord = (c: any, min?: number, max?: number) => Array.isArray(c) && c.length === 2 && c.every(x => isIntInRange(x, min, max));
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
                case "player":
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
    clientCopy(player?: PlayerId) {
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