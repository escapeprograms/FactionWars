import { Coordinate, PlayerId, Events, SocketEvent, Card, Deck, GameState,emptyPArr, play } from "./types.js";
import { arrEqual, doubleIt, isIntInRange } from "./utility.js";
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
        const ret = new Events();
        const card = this.deck.draw();
        if (!card) {console.log("No card drawn"); return ret;} // Potentially change later, but for now, the draw just fails
        /*doubleIt((i, j) => 
            ret[i][j].push({event: "card-drawn", params: (i === this.self[0] && j === this.self[1] ? [[...this.self], card] : [[...this.self]])}), 
        0, 0, 2, 2);*/
        ret.addFilteredEvent("card-drawn", [[...this.self], card], [[...this.self]], (i, j) => i === this.self[0] && j === this.self[1]);
        this.cards.push(card); // Add card to hand
        if (this.cards.length > MAX_HAND_SIZE) {
            ret.concat(this.discard(this.cards.length - 1)); // Immediately discard; hand is full
            console.log("Hand is full, drawn card immediately discarded");
        }
        return ret;
    }
    discard(index: number): Events {
        const ret = new Events();
        if (!isIntInRange(index, 0, this.cards.length - 1)) return ret; // Invalid discard
        this.deck.add(this.cards.splice(index, 1)[0]);
        //doubleIt((i, j) => ret[i][j].push({event: "card-discarded", params: [...this.self, index]}), 0, 0, 2, 2);
        ret.addEvent("card-discarded", [...this.self, index]);
        return ret;
    }
    // Deactivates buildings until energy is nonnegative
    // Pass in game
    upkeep(game: GameState): Events {
        const ret = new Events();
        const buildings = game.buildings;
        let i = buildings.length;
        while (this.energy < 0) {
            if (arrEqual(this.self, buildings[--i].owner) && buildings[i].stats.upkeep > 0) {
                ret.concat(buildings[i].deactivate(game));
            }
        }
        return ret;
    }
    // Plays the card at the specified index
    // Returns true on success
    play(game: GameState, index: number, targets: {[key: string]: any}): Events {
        //const self = game.get(this.self, "player") as Player; //
        const self = game.getPlayer(this.self);
        const ret = new Events();
        // can only play on your turn and can only play cards that exist
        if (game.turn === self.team && isIntInRange(index, 0, this.cards.length - 1)) {
            ret.concat(play(game, this.self, index, targets));
        }
        return ret;
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