type Faction = "T" | "M" | "S" | "A";

enum Team {
    Red = 0,
    Blue = 1
}

enum SocketState {
    Menu = 0,
    Lobby = 1,
    Game = 2
}

type SocketInfo = {
    state: SocketState,
    clientId: string,
    info: undefined | { player: Player, game: Game }
}

type Player = {
    id: string, // Server side, this is socketId; client side, this is client id
    name: string
    faction: Faction,
    team: Team,
    playerInfo: undefined | PlayerInfo // Undefined while in lobby
};

type Game = {
    players: Player[],
    id: string,
    started: boolean // Same as gameInfo === undefined
    gameInfo: undefined | GameInfo // Undefined while it is a lobby
};

type Result<T, U> = {
    isSuccessful: boolean,
    value: T | U
}

function success<T, U>(value: T): Result<T, U> {
    return {
        isSuccessful: true,
        value: value
    }
}

function failure<T, U>(value: U): Result<T, U> {
    return {
        isSuccessful: false,
        value: value
    }
}

enum CardType {
    Unit = "U",
    Building = "B",
    Operation = "O"
}