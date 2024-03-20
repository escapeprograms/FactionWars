import { GameState, PlayerArr, PlayerId, SocketEvent, emptyPArr } from "./types.js";
import { doubleIt } from "./utility.js";
import {Socket} from "socket.io";

class Events {
    private events: PlayerArr<SocketEvent[]> = emptyPArr<SocketEvent>();
    private log: SocketEvent[] = [];
    constructor() {
        // For now, assume 2 teams and 2 players per team
    }
    // whiteList is an array of players that receive the event. If undefined it is all players
    addEvent(event: string, params: any[], whiteList?: PlayerId[]) {
        if (whiteList) {
            whiteList.forEach(p => this.events[p[0]][p[1]].push({event, params}));
        } else {
            doubleIt((i, j)=>{this.events[i][j].push({event, params})}, 0, 0, 2, 2);
        }
        this.log.push({event, params});
    }
    // Add different event parameters based on filter function result
    addFilteredEvent(event: string, fullParams: any[], filteredParams: any[], filter: (i: number, j: number)=>boolean) {
        doubleIt((i, j)=>this.events[i][j].push({event, params: filter(i, j) ? fullParams : filteredParams}), 0, 0, 2, 2);
        this.log.push({event, params: fullParams});
    }
    concat(e: Events) {
        doubleIt((i, j) => this.events[i][j].push(...e.events[i][j]), 0, 0, 2, 2);
        this.log.push(...e.log);
    }
    send(game: GameState, sockets: Map<string, Socket>) {
        // Assumes 2 teams and 2 players per team
        doubleIt((i, j) => {
            const s = sockets.get(game.players[i][j].id);
            this.events[i][j].forEach(e => {
                s?.emit(e.event, ...e.params);
                console.log("Sending event", e.event, "to socket", s?.id);// For debugging purposes
            });
        }, 0, 0, 2, 2);
        // TODO: Also log the events
    }
}