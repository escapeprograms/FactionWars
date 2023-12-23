import { MAX_NAME_SIZE } from "./constants.js";

// Validates an input name
// Currently, only specifications is that the type is a string and name is not empty but also not too long.
export function isValidName(name) {
    return typeof name === "string" && name.length > 0 && name.length <= MAX_NAME_SIZE;
}

// Returns array of all tiles that are within a given radius of a coordinate
// Coordinate should have integer values, and radius should be nonnegative
// minX, minY, maxX, maxY are optional parameters that can be given to filter results
export function withinRadius(c, r, minX, minY, maxX, maxY){
    const result = [];
    const dy = Math.floor(r);
    const minDy = minY !== undefined ? Math.max(minY - c[1], -dy) : -dy;
    for (let y = maxY !== undefined ? Math.min(maxY - c[1], dy) : dy; y >= minDy; y--) {
        let dx = Math.floor(Math.sqrt(r**2 - y**2));
        let minDx = minX !== undefined ? Math.max(minX - c[0], -dx) : -dx;
        for (let x = maxX !== undefined ? Math.min(maxX - c[0], dx) : dx; x >= minDx; x--) {
            result.push([c[0] + x, c[1] + y])
        }
    }
    return result; // Note: this function has only been lightly tested
}