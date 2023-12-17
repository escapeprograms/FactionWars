import { Coordinate, Player,  Card, Deck, GameState, units, buildings } from "./types.js";
import { compArr, isInt } from "./utility.js";

export class PlayerInfo {
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
    draw() {
        const card = this.deck.draw();
        if (!card) {console.log("No card drawn"); throw new Error("Failed to draw a card");} //TODO Fix later
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
    // Deactivates buildings until energy is nonnegative
    // Pass in game
    upkeep(game: GameState) {
        const buildings = game.buildings;
        let i = buildings.length;
        while (this.energy < 0) {
            if (compArr(this.self, buildings[--i].owner) && buildings[i].stats.upkeep > 0) {
                buildings[i].deactivate(game);
            }
        }
    }
    // Plays the card at the specified index
    // Returns true on success
    play(game: GameState, index: number, targets: {[key: string]: any}) {
        const self = game.get(this.self, "player") as Player; //game.getPlayer(this.self);
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