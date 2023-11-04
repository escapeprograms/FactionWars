// Validates an input name
// Currently, only specifications is that the type is a string and name is not empty but also not too long.
function isValidName(name) {
    return typeof(name) === "string" && name.length > 0 && name.length <= MAX_NAME_SIZE;
}