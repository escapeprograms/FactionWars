import { Coordinate, Faction, PlayerId, PlayerArr, emptyPArr, SocketEvent, Events, Building, GameState, JsonActiveAbility, ActiveAbility, processData, EntityStats, Entity } from "./types.js";
import { arrEqual, concatEvents, dist, doubleIt } from "./utility.js";
import { withinRadiusInBounds } from "../Client/functions.js";
import u from "./../Client/units.json" assert {type: "json"};

export {Unit, UnitStats, units};

const defaults = {
    "splash": 0,
    "actives": [{
        "uses": 1,
        "effects": [{
            "modifiers": {}
        }]
    }],
    "passives": [],
    "attributes": [],
}
processData(u, defaults);
const units = (u as {[key: string]: JsonUnit}) as {[key: string]: UnitStats & {faction: Faction}};

type JsonUnit = {
    name: string;
    faction: Faction;
    maxHealth: number;
    damage: number; // Attack damage
    speed: number;
    range: number; // 1 = melee
    splash?: number; // Splash radius in tiles, 0 for melee
    actives?: JsonActiveAbility[];
    passives?: string[];
    attributes?: string[]; // Could potentially make a new type or enum for this
}

interface UnitStats extends EntityStats {
    speed: number;
}

class Unit extends Entity{
    public stats: UnitStats
    public steps = 0; // # of steps available
    public moves = 0; // # of times left the player can move the unit
    constructor(game: GameState, loc: Coordinate, stats: UnitStats, owner: PlayerId) {
        super(game, loc, stats, owner);
        this.stats = stats; // Is there an easier way where this line isn't needed?
        for (let i = 0; i < stats.actives.length; i++) this.activeUses.push(0);
    }
    startTurn(game: GameState): PlayerArr<SocketEvent[]> {
        // Do start turn stuff here, if any
        this.steps = this.stats.speed;
        this.moves = 1;
        return super.startTurn(game);
    }
    //endTurn() // Does nothing, inherited from Entity
    move(game: GameState, steps: Coordinate[]): PlayerArr<SocketEvent[]> {
        const ret: PlayerArr<SocketEvent[]> = emptyPArr();
        if (this.moves < 1) return ret;
        this.moves--; // Possibly modify this later?
        steps = [...steps]; // Avoid modifying parameters
        while (this.steps > 0 && steps.length > 0) {
            let step = steps[0];
            if (this.isAdj(step) && !game.getTile(step).occupant) {
                steps.shift();
                this.steps--;
                // TODO: Change later with invisible unit detection and other interrupts
                // And also later implement the differences in what events are sent
                const loc = this.loc;
                doubleIt((i, j) => ret[i][j].push({event: "move", params: [[...loc], [...step]]}), 0, 2, 0, 2);
                this.loc = step;
                // Add in invisible unit detection things here
                // Adjust name in references to this unit (owner.unit, for instance)
                const u = game.getPlayer(this.owner).playerInfo!.units
                const i = u.findIndex(c => arrEqual(c, this.loc));
                if (i < 0) throw new Error("Unit not found in owner's unit array");
                u[i] = [...this.loc]; // To avoid weird things happening
            } else {
                break; // invalid step
            }
        }
        return ret;
    }
    die(game: GameState): Events {
        // Eventually, implement on death effects (if any)
        // Remove from unit list
        let i = game.units.findIndex(u => u.loc === this.loc);
        if (i === -1) {throw new Error("Unit tried to die but was not found in game's unit array");}
        game.units.splice(i, 1);
        // Remove from player's owned units
        let u = game.getPlayer(this.owner).playerInfo!.units;
        i = u.findIndex(c => c === this.loc);
        if (i === -1) {throw new Error("Unit tried to die but was not found in player's unit array");}
        u.splice(i, 1);
        // Remove from tile
        game.getTile(this.loc).leave();
        // Return events
        return super.die(game);
        // There should be no more references to this unit so it can be garbage collected?
    }
    isAdj(loc: Coordinate): boolean {
        return loc[0] % 1 === 0 && loc[1] % 1 === 0 && (Math.abs(loc[0] - this.loc[0]) + Math.abs(loc[1] - this.loc[1]) === 1);
    }
}