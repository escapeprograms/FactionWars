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
    info: { user: User, lobby: Lobby } | { player: Player, game: Game }
}

type User = {
    id: string, // Server side, this is socketId; client side, this is client id
    name: string
    faction: Faction,
    team: Team,
};

type Lobby = {
    users: User[],
    id: string,
    started: boolean
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