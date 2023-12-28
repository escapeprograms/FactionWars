import { isValidName } from "./functions.js";

declare const io: any;
const socket = io();

let myId: string;
socket.on("id", (id: string) => myId = id);

const game = document.getElementById("game")!;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d")!;

// see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D
context.font = "20px sans-serif";
context.textAlign = "center";
context.textBaseline = "middle";

// parameters x and y represent top left corner unless specified otherwise

interface Drawable {
    draw: () => void;
    clear: () => void;
}

class Rect {
    constructor(
        public x: number,
        public y: number,
        public width: number,
        public height: number,
        public color = "white"
    ) {}

    draw() {
        context.fillStyle = this.color;
        context.fillRect(this.x, this.y, this.width, this.height);
    }
}

class Text {
    // x and y represent center
    constructor(
        public x: number,
        public y: number,
        public text: string,
        public fontSize = 20
    ) {}

    draw() {
        context.fillStyle = "black";
        context.font = this.fontSize + "px sans-serif";
        context.fillText(this.text, this.x, this.y);
    }
}

class HtmlUiElement<T extends HTMLElement> implements Drawable {
    drawn = false;

    constructor(public element: T) {}

    draw() {
        if (!this.drawn) {
            game.appendChild(this.element);
            this.drawn = true;
        }
    }

    clear() {
        if (this.drawn) {
            game.removeChild(this.element);
            this.drawn = false;
        }
    }
}

class Composite implements Drawable {
    constructor(public elems: Partial<Drawable>[]) {}

    draw() {
        this.elems.forEach(elem => elem.draw?.());
    }

    clear() {
        this.elems.forEach(elem => elem.clear?.());
    }
}

function background(color = "lightgray") {
    return new Rect(0, 0, canvas.width, canvas.height, color);
}

function button(x: number, y: number, width: number, height: number, text: string, callback: () => void) {
    const button = document.createElement("button");
    // button.type = "button";
    button.style.position = "absolute";
    button.style.left = x + "px";
    button.style.top = y + "px";
    button.style.width = width + "px";
    button.style.height = height + "px";
    button.style.font = "20px sans-serif";
    button.innerText = text;
    button.addEventListener("click", callback);
    return new HtmlUiElement(button);
}

function textInput(x: number, y: number, length: number, label: string, callback: (s: string) => void) {
    const input = document.createElement("input");
    input.style.position = "absolute";
    input.style.left = x + "px";
    input.style.top = y + "px";
    input.style.font = "20px sans-serif";
    input.size = length;
    input.placeholder = label;
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            callback(input.value);
        }
    });
    return new HtmlUiElement(input);
}

function switchTo(newScreen: Drawable) {
    screen.clear();
    newScreen.draw();
    screen = newScreen;
}

const mainMenu = new Composite([
    background(),
    button(300, 200, 200, 50, "Create", () => switchTo(createPrompt)),
    button(300, 350, 200, 50, "Join", () => switchTo(joinPrompt)),
]);

const createPrompt = new Composite([
    background(),
    textInput(300, 300, 10, "Name", createLobby),
]);

const joinPrompt = (() => {
    const onEnter = () => joinLobby(nameInput.element.value, codeInput.element.value.toUpperCase()); // also a string
    const nameInput = textInput(300, 200, 10, "Name", onEnter);
    const codeInput = textInput(300, 400, 10, "Code", onEnter);
    return new Composite([
        background(),
        nameInput,
        codeInput
    ]);
})();

// for now lobby player list is global so it will persist between lobby screens
let players: Player[] = [];
const redList = teamList();
const blueList = teamList();

function teamList() {
    const list = document.createElement("ul");
    list.style.font = "20px sans-serif";
    return list;
}

function updateUI() {
    redList.innerHTML = "";
    blueList.innerHTML = "";
    for (const player of players) {
        const list = player.team === 0 ? redList : blueList;
        list.innerHTML += `<li>${player.faction} ${player.name}</li>`;
    }
}

type Faction = "T" | "M" | "S" | "A";
type Team = 0 | 1;

interface Lobby {
    id: string;
    players: Player[];
}

class Player {
    constructor(
        public id: string,
        public name: string,
        public faction: Faction,
        public team: Team
    ) {}

    changeFaction(faction: Faction) {
        this.faction = faction;
        updateUI();
    }

    changeTeam(team: Team) {
        this.team = team;
        updateUI();
    }
}

function teamBox(x: number, color: string, list: HTMLUListElement) {
    const box = document.createElement("div");
    box.style.position = "absolute";
    box.style.left = x + "px";
    box.style.top = "130px";
    box.style.width = "385px";
    box.style.height = "400px";
    box.style.border = "solid " + color;
    box.appendChild(list);
    return new HtmlUiElement(box);
}

function switchToLobby(name: string, lobby: Lobby, host = false) {
    players = lobby.players.map(player =>
        new Player(player.id, player.name, player.faction, player.team));
    const me = players.find(player => player.id === myId)!;

    function changeMyFaction(faction: Faction) {
        if (me.faction !== faction) {
            me.changeFaction(faction);
            socket.emit("change-faction", faction);
        }
    }

    function changeMyTeam() {
        me.changeTeam(1 - me.team as Team);
        socket.emit("change-team");
    }

    const lobbyScreen = new Composite([
        background(),
        button(10, 10, 50, 50, "T", () => changeMyFaction("T")),
        button(70, 10, 50, 50, "M", () => changeMyFaction("M")),
        button(130, 10, 50, 50, "S", () => changeMyFaction("S")),
        button(190, 10, 50, 50, "A", () => changeMyFaction("A")),
        button(10, 70, 230, 50, "Change Teams", changeMyTeam),
        button(250, 10, 120, 50, "Start Game", () => socket.emit("start-game")),
        new Text(625, 75, lobby.id, 100),
        teamBox(10, "red", redList),
        teamBox(405, "blue", blueList),
    ]);

    switchTo(lobbyScreen);
    updateUI();
}

function createLobby(name: string) {
    if (!isValidName(name)) {
        console.log("invalid name");
    } else {
        socket.emit("create-game", name);
        socket.once("created-lobby", (lobby: Lobby) => {
            console.log(lobby);
            switchToLobby(name, lobby, true);
        });
    }
}

function joinLobby(name: string, code: string) {
    if (!isValidName(name)) console.log("invalid name");
    else {
        socket.emit("join-game", name, code);
        socket.once("lobby-join-result", (ok: boolean, joinResult: Lobby | string) => {
            if (!ok) console.log(joinResult);
            else {
                console.log(joinResult);
                switchToLobby(name, joinResult as Lobby);
            }
        });
    }
}

interface PlayerData {
    clientId: string;
    name: string;
    faction: Faction;
    team: Team;
}

socket.on("new-join", ({clientId, name, faction, team}: PlayerData) => {
    players.push(new Player(clientId, name, faction, team));
    updateUI();
});

socket.on("game-start", (data: any) => {
    console.log("Received 'game-start'!");
    console.log(data);
});

socket.on("player-left-lobby", (id: string) => {
    const index = players.findIndex(player => player.id === id);
    // Just in case
    if (index < 0) {
        console.log('ERROR!!!: Received "player-left-lobby" but could not find player!');
    }
    players.splice(index, 1);
    updateUI();
});

interface FactionChange {
    clientId: string;
    faction: Faction;
}

socket.on("faction-change", ({clientId, faction}: FactionChange) => {
    const player = players.find(p => p.id === clientId);
    if (!player) {
        console.log('ERROR!!!: Received "faction-change" but could not find player!');
    } else {
        player.changeFaction(faction);
    }
});

interface TeamChange {
    clientId: string;
    team: Team;
}

socket.on("team-change", ({clientId, team}: TeamChange) => {
    const player = players.find(p => p.id === clientId);
    if (!player) {
        console.log('ERROR!!!: Received "team-change" but could not find player!');
    } else {
        player.changeTeam(team);
    }
});

let screen: Drawable = mainMenu;
screen.draw();