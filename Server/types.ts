import { PlayerInfo, GameState, Card, Unit, Building } from "./game.js";

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
    state: SocketState.Menu,
    clientId: string
    info: undefined
} | {
    state: SocketState.Lobby | SocketState.Game,
    clientId: string,
    info: { player: Player, game: Game }
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

export type ClientGameState = {
    turn: number,
    // field (are we sending the field over?)
    fieldSize: number,
    players: {
        id: string, // this should be the clientID
        name: string
        faction: Faction,
        team: Team,
        playerInfo: undefined | { // Undefined only when the game is not in progress
            self: Coordinate,
            cards: Card[] | number, // If hidden, transforms cards into number of cards
            deck: number, // Deck size is sent instead of the deck itself
            buildings: Coordinate[], // Top left corners of their buildings
            units: Coordinate[], // Coordinates of their units
            money: number,
            energy: number, // Current energy available
            totalEnergy: number // Total energy
        }
    }[][],
    buildings: Building[]
    units: Unit[]
}