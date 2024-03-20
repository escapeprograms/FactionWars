import { withinRadiusInBounds } from "../Client/functions.js";
import { BuildingStats, CardType, Coordinate, Entity, Events, Faction, GameState, PlayerArr, PlayerId, SocketEvent, UnitStats, emptyPArr, processData } from "../Server/types.js";
import { buildings, units } from "../Server/types.js";
import { arrEqual, deepCopy, dist, doubleIt, getAdjTiles, isCoord, isIntInRange } from "../Server/utility.js";

import c from "./../Client/cards.json" assert {type: "json"};

export { Card, Deck, play, Effect, Target, checkTargets, doEffects};

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
    [key: string]: any
}

interface SpawnCard {
    id?: string;
    name?: string;
    faction?: Faction | "N";
    cardType: CardType.Building | CardType.Unit;
    cost: number;
    targets?: Target[];
    effects?: Effect[];
    onDiscard?: Effect;
    modifiers?: {[key: string]: any};
}

interface OpCard {
    id?: string;
    name: string,
    faction: Faction | "N",
    cardType: CardType.Operation,
    cost: number,
    targets: Target[],
    effects: Effect[],
    onDiscard?: Effect,
    modifiers?: {[key: string]: any};
}

type JsonCard = SpawnCard | OpCard

const tempCards: {[key: string]: JsonCard} = c as {[key: string]: JsonCard};

// Add in default properties
// Can't use processData() because building/unit defaults pull form building/unit.json
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
    if (!("modifiers" in card)) card.modifiers = {};
}
export const cards = tempCards as {[key: string]: Card};

interface Card {
    objectType: "Card",
    id: string, // internal identifier, same as key in cards object
    name: string, // external name for card
    faction: Faction | "N", // Faction this belongs to, or "N" for Neutral
    cardType: CardType // Building | Unit | Operation
    cost: number, // cost in money
    targets: Target[],
    effects: Effect[],
    onDiscard?: Effect,
    modifiers: {[key: string]: any}
}


// Does not check if it is the player's turn
function play(game: GameState, owner: PlayerId, index: number, targets: {[key: string]: any}): Events {
    const player = game.getPlayer(owner).playerInfo;
    const card = player.cards[index];
    const ret = new Events();
    // Validate targets && costs
    if (card.cost <= player.money && checkTargets(game, owner, card, card.targets, targets)) {
        // Decrement money
        if (card.cost !== 0) {
            player.money -= card.cost;
            //doubleIt((i, j)=>ret[i][j].push({event: "change-money", params: [[...owner], -card.cost]}), 0, 0, 2, 2);
            ret.addEvent("change-money", [[...owner], -card.cost]);
        }
        // Play effects
        ret.concat(doEffects(game, owner, targets, card, ...card.effects));
        // Discard card
        ret.concat(player.discard(index)); // May need to modify later if we have onDiscard effects
    }
    return ret;
}

// Does not validate targets
function doEffects(game: GameState, owner: PlayerId, targets: {[key: string]: any}, self: Card | Entity, ...effectArr: Effect[]): Events {
    const ret = new Events();
    effectArr.forEach(e => ret.concat(effects[e.effect](game, owner, replaceVars(game, owner, self, e, targets), self)));
    return ret;
}

// Returns a copy of obj with all properties beginning with '$' replaced by the corresponding value in vars
// Properties beginning with '#' have special meanings and are replaced accordingly
function replaceVars(game: GameState, owner: PlayerId, self: Card | Entity, obj: {[key: string]: any}, vars: {[key: string]: any}, ) {
    const copy = {...obj};
    for (let key in copy) {
        const val = obj[key];
        if (typeof(val) === "string" && val[0] === "$") copy[key] = vars[val];
        else copy[key] = replaceReferences(game, owner, self, val);
    }
    return copy;
}

// Only works with json values, which is to say, doesn't work with functions
function replaceReferences(game: GameState, owner: PlayerId, self: Card | Entity, ref: any) {
    if (Array.isArray(ref)) {
        ref = [...ref];
        for (let i = 0; i < ref.length; i++) ref[i] = replaceReferences(game, owner, self, ref[i]);
        return ref;
    } else if (typeof ref === "object") {
        ref = {...ref}; // This should be fine? Don't need deep copy?
        const keys = Object.keys(ref);
        for (let key of keys) ref[key] = replaceReferences(game, owner, self, ref[key]);
        return ref;
    }
    if (typeof ref != "string" || ref[0] != "#") return ref;
    switch(ref) {
        case "#selfCard":
            if (self.objectType === "Card") return self;
            else throw new Error("Effect parameter required a Card but effect user was not a Card");
        case "#selfLoc":
            if (self.objectType === "Card") throw new Error("Effect parameter required a location but effect user was a Card");
            else return (self as Entity).loc;
        case "#selfPlayer":
            return owner;
        default:
            throw new Error("Unknown default variable name");
    }
}

function checkTargets(game: GameState, owner: PlayerId, self: Card | Entity, reqs: Target[], targets: {[key: string]: any}): boolean {
    targets = replaceReferences(game, owner, self, targets);
    return reqs.every(t => validateTarget[t.type](game, targets[t.name], owner) && 
        Object.keys(t.properties).every(p => validateProperties[p](game, targets[t.name], owner, self, t.properties[p])))
}

const effects: {[key: string]: (game: GameState, owner: PlayerId, params: {[key: string]: any}, self: Card | Entity) => Events} = {
    "gain": (game, owner, params, self) => {
        // Assume gain is money for now
        const ret = new Events();
        game.getPlayer(params.target).playerInfo.money += params.quantity
        //doubleIt((i, j)=>ret[i][j].push({event: "change-money", params: [[...params.target], params.quantity]}), 0, 0, 2, 2);
        ret.addEvent("change-money", [[...params.target], params.quantity]);
        return ret; 
    },
    "heal": (game, owner, params, self) => {
        const ret = new Events();
        const target = game.getOccupant(params.target);
        if (target) {
            //concatEvents(ret, target.heal(game, params.amount + ("heal" in params.modifiers ? params.modifiers.heal : 0)));
            return target.heal(game, params.amount + ("heal" in self.modifiers ? self.modifiers.heal : 0));
        }
        return ret;
    },
    // Modifies (change/set), the property given by the path "modification"
    // Currently does not work with arrays
    // Objects in the path should have exactly 1 key
    // End value cannot be object, but rather has to be number/boolean/string
    "modify-modifier": (game, owner, params, self) => {
        const ret = new Events();
        let modification = {"modifiers": deepCopy(params.modification)} as {[key: string]: any};
        let modifier = self as {[key: string]: any};
        let key = "modifiers";
        // Follow the path
        while (typeof modification[key] === "object") {
            // Create object as necessary
            if (!(key in modifier)) modifier[key] = {};
            modifier = modifier[key];
            modification = modification[key];
            key = Object.keys(modification)[0];
        }
        if (params.type === "set" || !(key in modifier)) {
            modifier[key] = modification[key];
        } else { // params.type === "change"
            modifier[key] += modification[key];
        }
        return ret;
    },
    "modify-stats": (game, owner, params, self) => {
        const target = game.getOccupant(params.target);
        if (target) {
            return target.modifyStats(game, params.stat, params.amount, params.type);
        }
        return new Events();
    },
    "spawn": (game: GameState, owner: PlayerId, params: {[key: string]: any}, self) => {
        const type = params.type as string; // Building or Unit
        const copy = deepCopy((type === "B" ? buildings : units)[params.id]);
        const modifiers = self.modifiers["spawn"];
        if (modifiers) {
            if ("damage" in modifiers) copy.damage += modifiers.damage;
            if ("health" in modifiers) copy.maxHealth += modifiers.health;
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

const validateProperties: {[key:string]: (game: GameState, target: any, owner: PlayerId, self: Card | Entity, value: any) => boolean} = {
    // For tiles
    "buildable": (game, target: Coordinate, owner, self, size: number) => {
        if (typeof(size) !== "number" || !target.every((x: number)=>x+size<game.fieldSize)) return false;
        // Ensure space is vacant
        let valid = true;
        doubleIt((i, j)=> {if(game.field[i][j].occupant) valid = false;}, target[0], target[1], target[0]+size, target[1]+size);
        if (!valid) return false;
        // Ensure building is next to a unit belonging to the player
        getAdjTiles(game, target, size).some(c => game.getTile(c)?.occupantType === "unit" && arrEqual(game.getUnit(c)!.owner, owner));
        return valid;
    },
    "empty": (game, target: Coordinate) => game.getTile(target).occupant === null,
    "spawnable": (game, target: Coordinate, owner) => !game.getTile(target).occupant && 
        getAdjTiles(game, target).some(c => game.getTile(c)?.occupantType === "building" && arrEqual(game.getBuilding(c)!.owner, owner)),
    // For buildings or units
    // type is either "self", "allied", or "enemy"
    "owner": (game, target: Coordinate, owner, self, type: string) => type === "self" ? arrEqual(target, owner) : (type === "allied") === (target[0] === owner[0]),
    // Defaults to false if it's a card which doesn't have a location
    "withinRadius": (game, target: Coordinate, owner, self, radius: number) => "loc" in self ? dist(target, self.loc) <= radius : false
}

//const getTerms: {[key:string]: (game: GameState, target: any) => any}