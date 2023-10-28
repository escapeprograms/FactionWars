const lobbyTable: { [key: string]: Lobby } = {};

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
function createLobby(user: User): Lobby {
    const lobbyId = generateLobbyId();
    const lobby = {
        users: [user],
        id: lobbyId,
        started: false
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
function joinLobby(user: User, id: string): Result<Lobby, LobbyJoinError> {
    if (!/^[A-Z]{4}$/.test(id)) { return failure(LobbyJoinError.InvalidId); } // Checks that id is exactly 4 uppercase letters
    const lobby = lobbyTable[id];
    if (lobby === undefined) { return failure(LobbyJoinError.LobbyDoesntExist); }
    if (lobby.started) { return failure(LobbyJoinError.GameStarted); }
    if (lobby.users.length >= 4) { return failure(LobbyJoinError.LobbyFull); }
    // id is valid, join the game
    lobby.users.push(user);
    return success(lobby);
}

// Converts socketIds from users the given lobby into clientIds and returns a new lobby object
function filterLobby(lobby: Lobby): Lobby {
    return {
        users: lobby.users.map(user => { return {
            id: socketTable[user.id].clientId,
            name: user.name,
            faction: user.faction,
            team: user.team
        }}),
        id: lobby.id,
        started: lobby.started
    };
}