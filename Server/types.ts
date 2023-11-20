import { PlayerInfo, GameState } from "./game.js";

export type Faction = "T" | "M" | "S" | "A";

export enum Team {
    Red = 0,
    Blue = 1
}

export enum SocketState {
    Menu = 0,
    Lobby = 1,
    Game = 2
}

export type SocketInfo = {
    state: SocketState,
    clientId: string,
    info: undefined | { player: Player, game: Game }
}

export type Player = {
    id: string, // Server side, this is socketId; client side, this is client id
    name: string
    faction: Faction,
    team: Team,
    playerInfo: undefined | PlayerInfo // Undefined while in lobby
};

export type Game = {
    players: Player[],
    id: string,
    started: boolean // Same as gameInfo === undefined
    gameInfo: undefined | GameState // Undefined while it is a lobby
};

export type Result<T, U> = {
    isSuccessful: boolean,
    value: T | U
}

export function success<T, U>(value: T): Result<T, U> {
    return {
        isSuccessful: true,
        value: value
    }
}

export function failure<T, U>(value: U): Result<T, U> {
    return {
        isSuccessful: false,
        value: value
    }
}

export enum CardType {
    Unit = "U",
    Building = "B",
    Operation = "O"
}

export type Coordinate = [number, number];