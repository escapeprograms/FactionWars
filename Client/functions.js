import {MAX_NAME_SIZE} from "./constants.js"

// Validates an input name
// Currently, only specifications is that the type is a string and name is not empty but also not too long.
export function isValidName(name) {
    return typeof (name) === "string" && name.length > 0 && name.length <= MAX_NAME_SIZE;
}
