import { BuildingStats, CardType, Coordinate, Events, Faction, GameState, PlayerArr, PlayerId, SocketEvent, UnitStats, emptyPArr } from "../Server/types.js";
import { buildings, units } from "../Server/types.js";
import { arrEqual, concatEvents, deepCopy, doubleIt, isCoord, isIntInRange } from "../Server/utility.js";

import c from "./../Client/cards.json" assert {type: "json"};

export { Card, Deck, play};

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

// Process import
type Target = {
    name: string, // beginning with $
    type: string, // tile/unit/building/player/card etc.
    properties: {
        [key: string]: any
    }
}

type Effect = {
    effect: string, // name of the type of effect
    modifiers: {[key: string]: any},
    [key: string]: any
}

type JsonEffect = {
    effect: string,
    modifiers?: {[key: string]: any},
    [key: string]: any
}

interface SpawnCard {
    id?: string;
    name?: string;
    faction?: Faction | "N";
    cardType: CardType.Building | CardType.Unit;
    cost: number;
    targets?: Target[];
    effects?: JsonEffect[];
    onDiscard?: Effect;
}

interface OpCard {
    id?: string;
    name: string,
    faction: Faction | "N",
    cardType: CardType.Operation,
    cost: number,
    targets: Target[],
    effects: JsonEffect[],
    onDiscard?: Effect
}

type JsonCard = SpawnCard | OpCard

const tempCards: {[key: string]: JsonCard} = c as {[key: string]: JsonCard};

// Add in default properties
for (let key in tempCards) {
    const card = tempCards[key];
    const type = tempCards[key].cardType;
    if (!card["id"]) card["id"] = key;
    if (type === "B" || type === "U") {
        const db = type === "B" ? buildings : units;
        if (!card["name"]) card["name"] = db[key]["name"];
        if (!card["faction"]) card["faction"] = db[key]["faction"];
        if (!card["effects"]) card["effects"] = [{"effect": "spawn", "type": type, "id": key, "loc": "$loc"}];
        if (!card["targets"]) card["targets"] = [{"name": "$loc", "type": "tile", "properties": {[type === "B" ? "buildable" : "spawnable"]: true}}];
    }
    for (let effect of card.effects!) {
        if (!("modifiers" in effect)) effect.modifiers = {};
    }
}
export const cards = tempCards as {[key: string]: Card};

interface Card {
    id: string, // internal identifier, same as key in cards object
    name: string, // external name for card
    faction: Faction | "N", // Faction this belongs to, or "N" for Neutral
    cardType: CardType // Building | Unit | Operation
    cost: number, // cost in money
    targets: Target[],
    effects: Effect[],
    onDiscard?: Effect
}


// Does not check if it is the player's turn
function play(game: GameState, owner: PlayerId, index: number, targets: {[key: string]: any}): Events {
    const player = game.getPlayer(owner).playerInfo;
    const card = player.cards[index];
    const ret = emptyPArr<SocketEvent>();
    // Validate targets && costs
    if (card.cost <= player.money && 
        card.targets.every(t => validateTarget[t.type](game, targets[t.name], owner) && 
        Object.keys(t.properties).every(p => validateProperties[p](game, targets[t.name], owner, t.properties[p])))) {
        // Decrement money
        if (card.cost !== 0) {
            player.money -= card.cost;
            doubleIt((i, j)=>ret[i][j].push({event: "change-money", params: [[...owner], -card.cost]}), 0, 0, 2, 2);
        }
        // Play effects
        card.effects.forEach(e => concatEvents(ret, effects[e.effect](game, owner, card, replaceVars(e, targets))));
        // Discard card
        concatEvents(ret, player.discard(index)); // May need to modify later if we have onDiscard effects
    }
    return ret;
}

// Returns a copy of obj with all properties beginning with '$' replaced by the corresponding value in vars
function replaceVars(obj: {[key: string]: any}, vars: {[key: string]: any}) {
    const copy = {...obj};
    for (let key in copy) {
        const val  = obj[key];
        if (typeof(val === "string") && val[0] === "$") copy[key] = vars[val];
    }
    return copy;
}

const effects: {[key: string]: (game: GameState, owner: PlayerId, card: Card, params: {[key: string]: any}) => Events} = {
    "modify": (game, owner, card, params) => {
        const ret = emptyPArr<SocketEvent>();
        const effect = card.effects[params.on]; // Index of the effect
        if (effect === undefined) return ret;
        if (params.type in effect.modifiers) {
            // Modification is either "set" or "change"
            //params.modification === "set" ? effect.modifiers[params.type] = params.amount : effect.modifiers[params.type] += params.amount;
            effect.modifiers[params.type] = params.amount + (params.modification === "change" ? effect.modifiers[params.type] : 0);
        } else {
            effect.modifiers[params.type] = params.amount;
        }
        return ret;
    },
    "gain": (game, owner, card, params) => {
        // Assume gain is money for now
        const ret = emptyPArr<SocketEvent>();
        game.getPlayer(params.target).playerInfo.money += params.quantity
        doubleIt((i, j)=>ret[i][j].push({event: "change-money", params: [[...params.target], params.quantity]}), 0, 0, 2, 2);
        return ret; 
    },
    "spawn": (game: GameState, owner: PlayerId, card, params: {[key: string]: any}) => {
        const type = params.type as string; // Building or Unit
        const copy = deepCopy((type === "B" ? buildings : units)[params.id]);
        if ("modifiers" in params) {
            if ("damage" in params.modifiers) copy.damage += params.modifiers.damage;
            if ("health" in params.modifiers) copy.maxHealth += params.modifiers.health;
        }
        return type === "B" ? game.spawnBuilding(copy as BuildingStats, params["loc"][0], params["loc"][1], owner) 
            : game.spawnUnit(copy as UnitStats, params["loc"][0], params["loc"][1], owner);
    },
    
}

const validateTarget: {[key:string]: (game: GameState, target: any, owner: PlayerId) => boolean} = {
    "tile": (game: GameState, target: any) => isCoord(target) && target.every((x: number) => isIntInRange(x, 0, game.fieldSize - 1)),
    "unit": (game: GameState, target: any, owner) => validateTarget["tile"](game, target, owner) && game.getTile(target).occupantType === "unit",
    "building": (game: GameState, target: any, owner) => validateTarget["tile"](game, target, owner) && game.getTile(target).occupantType === "building",
    "player": (game: GameState, target: any) => isCoord(target) && target.every((x: number) => isIntInRange(x, 0, 1)),
    "card": (game: GameState, target: any, owner: PlayerId) => typeof(target) === "object" && 
        "player" in target && validateTarget["player"](game, target["player"], owner) && 
        "index" in target && isIntInRange(target["index"], 0, game.getPlayer(target["player"]).playerInfo.cards.length - 1) 
    // For a card, it should be an object: {player: PlayerId, index: number}
    //TODO: eventually implement "choice": (game: GameState, target: any) => 
};

const validateProperties: {[key:string]: (game: GameState, target: any, owner: PlayerId, value: any) => boolean} = {
    // For tiles only
    "buildable": (game, target: Coordinate, owner, size: number) => {
        if (typeof(size) !== "number" || !target.every((x: number)=>x+size<game.fieldSize)) return false;
        // Ensure space is vacant
        let valid = true;
        doubleIt((i, j)=> {if(game.field[i][j].occupant) valid = false;}, target[0], target[1], target[0]+size, target[1]+size);
        if (!valid) return false;
        // Ensure building is next to a unit belonging to the player
        adj(game, target, size).some(c => game.getTile(c)?.occupantType === "unit" && arrEqual(game.getUnit(c)!.owner, owner));
        return valid;
    },
    "empty": (game, target) => game.getTile(target).occupant === null,
    "spawnable": (game, target: Coordinate, owner) => !game.getTile(target).occupant && 
        adj(game, target).some(c => game.getTile(c)?.occupantType === "building" && arrEqual(game.getBuilding(c)!.owner, owner)),
}

//const getTerms: {[key:string]: (game: GameState, target: any) => any}
// target should be a valid Coordinate, length should be size of object in tiles-lengths
function adj(game: GameState, target: Coordinate, length=1) {
    const borders: Coordinate[] = [];
    function getBorder(side: 0 | 1) {
        for (let x = target[side]; x < target[side]+length; x++) {
            if (target[1 - side] - 1 >= 0) borders.push([x, target[1 - side]-1]);
            if (target[1 - side] + length < game.fieldSize) borders.push([x, target[1 - side] + length]);
        }
    }
    getBorder(0);
    getBorder(1);
    return borders;
}