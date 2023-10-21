"use strict";
const lobbyTable = {};
// Generate an unused lobbyID (four random capital letters)
function generateLobbyId() {
    // Client will generate words for the letters
    const genLetter = () => (Math.floor(Math.random() * 26) + 10).toString(36);
    const mkString = () => (genLetter() + genLetter() + genLetter() + genLetter()).toUpperCase();
    let id;
    while (lobbyTable[id = mkString()] !== undefined)
        ;
    return id;
}
// create lobby and returns id
function createLobby(user) {
    const lobbyId = generateLobbyId();
    const lobby = {
        users: [user],
        id: lobbyId,
        started: false
    };
    lobbyTable[lobbyId] = lobby;
    return lobbyId;
}
var LobbyJoinError;
(function (LobbyJoinError) {
    LobbyJoinError["InvalidId"] = "Invalid game code";
    LobbyJoinError["LobbyDoesntExist"] = "Lobby doesn't exist";
    LobbyJoinError["LobbyFull"] = "Lobby full";
    LobbyJoinError["GameStarted"] = "Game already started";
})(LobbyJoinError || (LobbyJoinError = {}));
// Add user to lobby if able
// on success, return user object who joined
// on failure, return error enum
// We are assuming no race conditions here; if it breaks, then we whip out the semaphore thingies
function joinLobby(user, id) {
    if (!/^[A-Z]{4}$/.test(id)) {
        return LobbyJoinError.InvalidId;
    } // Checks that id is exactly 4 uppercase letters
    const lobby = lobbyTable[id];
    if (lobby === undefined) {
        return LobbyJoinError.LobbyDoesntExist;
    }
    if (lobby.started) {
        return LobbyJoinError.GameStarted;
    }
    if (lobby.users.length >= 4) {
        return LobbyJoinError.LobbyFull;
    }
    // id is valid, join the game
    lobby.users.push(user);
    return user;
}
