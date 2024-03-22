// Merge functions.js once it becomes functions.ts
import { Coordinate, Events, GameState } from "./types.js";

// Returns array of coordinates of all bordering tiles
// target should be a valid Coordinate, length should be size of entity in tile-lengths
export function getAdjTiles(game: GameState, target: Coordinate, length=1): Coordinate[] {
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

export function arrEqual<T>(c1: T[], c2: T[]) {
    return c1.length === c2.length && c1.every((e, i)=>e === c2[i]);
}

/*// Modifies e1 in place by appending events from e2 to e1
export function concatEvents(e1: Events, e2: Events) {
    doubleIt((i, j)=>e1[i][j].push(...e2[i][j]), 0, 0, 2, 2);
}*/

// Makes a deep copy of objects and primitives
// Does not work witih functions and symbols
// DOES NOT WORK WITH CIRCULAR REFERENCES!!!
export function deepCopy<U>(obj: U[]): U[];
export function deepCopy<T>(obj: T): T;
export function deepCopy<U, T>(obj: T | U[]): T | U[] {
    if (Array.isArray(obj)) return obj.map(x => deepCopy(x));
    if (typeof obj === "object") {
        
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

// Returns euclidean distance between two coordinates
export function dist(a: Coordinate, b: Coordinate): number {
    return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2);
}

export function doubleIt(f: (i: number, j: number)=>void, x:number, y:number, xEnd:number, yEnd:number) {
    for (let i = x; i < xEnd; i++) {
        for (let j = y; j < yEnd; j++) {
            f(i, j);
        }
    }
}

// Checks if c is of type Coordinate, aka [number, number]
export function isCoord(c: any) {
    return Array.isArray(c) && c.length === 2 && typeof(c[0]) === "number" && typeof(c[1]) === "number";
}

// Given a number, returns whether or not that number is an integer
// If given min and max, also checks if the number is within that range (inclusive)
export function isIntInRange(num: number, min=-Infinity, max=Infinity): boolean {
    return num % 1 === 0 && num >= min && num <= max;
}