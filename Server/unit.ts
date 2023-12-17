import { Coordinate, PlayerArr, emptyPArr, SocketEvent, Building, GameState } from "./types.js";
import { compArr, dist, doubleIt } from "./utility.js";
import { withinRadius } from "../Client/functions.js";

export {Unit, UnitStats};

type UnitStats  = {
    // Contains the stats of a unit
    maxHealth: number;
    damage: number; // Attack damage
    speed: number;
    range: number; // 1 = melee
    splash: number; // Splash radius in tiles, 0 for melee
    attributes: string[]; // Could potentially make a new type or enum for this
    // Possibly add methods for getting and changing stats
    // Possibly add methods for taking damage, dying, and other actions
}

class Unit {
    public loc: Coordinate;
    public stats: UnitStats;
    public owner: Coordinate; // [team, number] of player
    public health: number; // Current health
    public steps = 0; // # of steps available
    public moves = 0; // # of times left the player can move the unit
    public attacks = 0; // # of times left the unit can attack
    // Add team and/or faction property?
    constructor(loc: Coordinate, stats: UnitStats, player: Coordinate) {
        this.loc = loc;
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
                const i = u.findIndex(c => compArr(c, this.loc));
                if (i < 0) throw new Error("Unit not found in owner's unit array");
                u[i] = [...this.loc]; // To avoid weird things happening
            } else {
                break; // invalid step
            }
        }
        return ret;
    }
    attack(game: GameState, target: Coordinate) {
        if (this.attacks < 1) return; // Out of attacks
        if (dist(this.loc, target) > this.stats.range) return; // Out of range
        if (!game.sight(this.loc, target)) return; // Cannot see target
        if (this.stats.splash <= 0 && !game.getTile(target).occupant) return; // Non-splashers cannot attack empty tile
        // Eventually special effects as needed
        // NOTE: The code does not check for friendly fire!
        // Will have to adjust victim finding if field ever becomes non-square
        let victim;
        (withinRadius(target, this.stats.splash, 0, 0, game.fieldSize-1, game.fieldSize-1) as Coordinate[]).forEach(v => {
            if (victim = game.getOccupant(v) as Unit | Building | null) victim.takeDamage(game, this.stats.damage);
        });
        
        this.attacks--;
    }
    takeDamage(game: GameState, damage: number) {
        // Eventually implement special abilities as necessary
        this.health -= damage;
        if (this.health <= 0) this.die(game);
    }
    die(game: GameState) {
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
        // There should be no more references to this unit so it can be garbage collected?
    }
    isAdj(loc: Coordinate): boolean {
        return loc[0] % 1 === 0 && loc[1] % 1 === 0 && (Math.abs(loc[0] - this.loc[0]) + Math.abs(loc[1] - this.loc[1]) === 1);
    }
}