import { GameState, Tile } from "./game.js";
import { Card } from "./card.js";
import { Unit } from "./unit.js";
import { Building } from "./building.js";
import { PlayerInfo } from "./player.js";

export * from "./building.js";
export * from "./unit.js";
export * from "./card.js";
export * from "./game.js";
export * from "./player.js";

export type Faction = "T" | "M" | "S" | "A";

export enum Team {
    Red = 0,
    Blue = 1
}

export enum SocketState {
    Menu = 0,
    Lobby = 1,
    Game = 2,
    GameEnd = 3
}

export type SocketInfo = {
    state: SocketState.Menu,
    clientId: string
    info: undefined
} | {
    state: SocketState.Lobby | SocketState.Game | SocketState.GameEnd,
    clientId: string,
    info: { player: Player, lobby: Lobby }
}

export type Player = {
    id: string, // Server side, this is socketId; client side, this is client id
    name: string
    faction: Faction,
    team: Team,
    playerInfo: undefined | PlayerInfo, // Undefined while in lobby
    connected: boolean // False if they have disconnected
};

export type Lobby = {
    players: Player[],
    id: string,
    active: boolean // Whether or not the game is active
    gameInfo: undefined | GameState // Guaranteed to be defined when active
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

export type SocketEvent = {event: string, params: any}

export type PlayerArr<T> = [T[], T[]];
export const emptyPArr = <T>() => [[[], []], [[], []]] as PlayerArr<T[]>;

export type Events = PlayerArr<SocketEvent[]>;

export type ClientGameState = {
    turn: number,
    field: Tile[][],
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