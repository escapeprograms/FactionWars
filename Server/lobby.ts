import { Lobby, Player, Result, failure, success } from "./types.js";
import { socketTable } from "./users.js"

export const lobbyTable: { [key: string]: Lobby } = {};

// Generate an unused lobbyID (four random capital letters)
function generateLobbyId(): string {
    // Client will generate words for the letters
    const genLetter = () => (Math.floor(Math.random() * 26) + 10).toString(36);
    const mkString = () => (genLetter() + genLetter() + genLetter() + genLetter()).toUpperCase();
    let id;
    while (lobbyTable[id = mkString()] !== undefined);
    return id;
}

// create lobby and return it
export function createLobby(player: Player): Lobby {
    const lobbyId = generateLobbyId();
    const lobby: Lobby = {
        players: [player],
        id: lobbyId,
        active: false,
        gameInfo: undefined
    };
    lobbyTable[lobbyId] = lobby;
    return lobby;
}

enum LobbyJoinError {
    InvalidId = "Invalid game code",
    LobbyDoesntExist = "Lobby doesn't exist",
    LobbyFull = "Lobby full",
    GameStarted = "Game already started"
}

// Add user to lobby if able
// on success, return lobby that was joined
// on failure, return error enum
// We are assuming no race conditions here; if it breaks, then we whip out the semaphore thingies
export function joinLobby(player: Player, id: string): Result<Lobby, LobbyJoinError> {
    if (!/^[A-Z]{4}$/.test(id)) { return failure(LobbyJoinError.InvalidId); } // Checks that id is exactly 4 uppercase letters
    const lobby = lobbyTable[id];
    if (lobby === undefined) { return failure(LobbyJoinError.LobbyDoesntExist); }
    if (lobby.active) { return failure(LobbyJoinError.GameStarted); }
    if (lobby.players.length >= 4) { return failure(LobbyJoinError.LobbyFull); }
    // id is valid, join the game
    lobby.players.push(player);
    return success(lobby);
}

// Converts socketIds from users the given lobby into clientIds and returns a new lobby object
export function filterLobby(lobby: Lobby): Lobby {
    return {
        players: lobby.players.map(player => ({
            id: socketTable[player.id].clientId,
            name: player.name,
            faction: player.faction,
            team: player.team,
            playerInfo: player.playerInfo,
            status: player.status
        })),
        id: lobby.id,
        active: lobby.active,
        gameInfo: lobby.gameInfo // DOES NOT FILTER GAMESTATE!
    };
}

// NOTE: THE FUNCTION BELOW HAS NOT BEEN TESTED (But hopefully should work properly)
// Verifies lobby is ready for game start
export function verifyLobby(lobby: Lobby): boolean {
    const players = lobby.players;
    const factions: {[key: string]: boolean} = {};
    players.forEach(p=>factions[p.faction] = true);
    // 4 users, unique factions, 2 users per team
    // DOES NOT VERIFY THAT THE LOBBY IS NOT AN ALREADY STARTED GAME
    return players.length === 4 && Object.keys(factions).length === 4 && players.reduce((acc, e)=>acc + e.team, 0) === 2;
}