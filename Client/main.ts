import { TURN_LENGTH } from "./constants.js";
import { isValidName } from "./functions.js";

declare const io: any;
const socket = io();
//
export {socket, players, redList, blueList};

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
    console.log("Recieved new join with name: " + name);
    players.push(new Player(clientId, name, faction, team));
    updateUI();
});

socket.on("game-start", (data: any) => {
    console.log("Received 'game-start'!");
    console.log(data);

    // Testing code here

    data.getPlayer = (c: any) => data.players[c[0]][c[1]];
    // Oh no, code duplication!?!
    data.getTile = (c: any) => {
        return data.field[c[0]][c[1]];
    }
    data.getBuilding = (c: any) => {
        return data.buildings.find((b: any) => b.loc[0] === c[0] && b.loc[1] === c[1]);
    }
    data.getUnit = (c: any) => {
        return data.units.find((b: any) => b.loc[0] === c[0] && b.loc[1] === c[1]);
    }
    // Versatile but painful to use due to typing
    data.get = (c: any, type: "unit" | "building" | "tile" | "player" | null) => {
        if (c === null) return null;
        if (type === "unit" || type === "building") return data[type + "s" as "units" | "buildings"].find((x: any) => x.loc[0] === c[0] && x.loc[1] === c[1]);
        else if (type === "tile" || type === "player") return data[type === "tile" ? "field" : "players"][c[0]][c[1]];
        else return null;
    }
    data.getOccupant = (c: any) => {
        const tile = data.getTile(c);
        return data.get(tile.occupant, tile.occupantType);
    }

    document.getElementById("game")!.hidden = true;
    document.getElementById("inGame")!.hidden = false;
    const gameGrid = document.getElementById("game-grid")!;
    gameGrid.hidden = false;
    // Create grid
    for (let i=0;i<50;i++) {
        for (let j=0;j<50;j++){
            const elem = document.createElement("div");
            elem.id = "["+i+","+j+"]";
            elem.className = "tile";
            //const a = document.createElement("a");
            //a.href = 
            //const a = document.createTextNode("empty");
            const a = document.createElement("img");
            a.className = "tile-display";
            
            a.src = "./Assets/" + (data.field[i][j].occupant ? (data.field[i][j].occupantType == "unit" ? "unknown_unit": "unknown_building" ) : "temp-grass") + ".png";
            a.addEventListener("click", ()=>console.log(data.getOccupant([i, j])));//
            elem.appendChild(a);
            gameGrid.appendChild(elem);
        }
    }
    // Create stats
    let stats = ["money", "energy", "cards"];
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            const div = document.getElementById("" + i + "-" + j)!;
            let text=  document.createTextNode("Player"+"["+i+","+j+"]");
            div.appendChild(text);
            stats.forEach(s => {
                const elem = document.createElement("div");
                elem.id = "" + i + "-" + j + "-" + s;
                let text = document.createTextNode(s + ": ");
                elem.appendChild(text);
                text = document.createTextNode(data.players[i][j].playerInfo[s]);
                elem.appendChild(text);
                div.appendChild(elem);
            });
        }
    }
    // Create global stats
    let elem = document.getElementById("turn#")!;
    elem.textContent = data.turn;
});

// New test code here too
let timer: NodeJS.Timeout;
socket.on("turn-start", ()=>{
    console.log("Received 'turn-start'");
    console.log("Setting timer for " + (TURN_LENGTH - 500) + " milliseconds");
    timer = setTimeout(()=>console.log("Time's up!"), TURN_LENGTH - 500); // A bit of leeway just in case
});
socket.on("turn-end", ()=>{
    console.log("Received 'turn-end', changing turn #");
    document.getElementById("turn#")!.textContent = (1 - (document.getElementById("turn#")!.textContent! as any as number)) as any as string;
    clearTimeout(timer);
});
function getStatNode(playerId: any, statName: string) {
    const temp = document.getElementById(""+playerId[0]+"-"+playerId[1]+"-"+statName);
    return temp?.lastChild;
}
const format = (playerId: [number, number]) => "["+playerId[0]+","+playerId[1]+"]";
socket.on("card-drawn", (playerId: any, card?: any)=> {
    console.log(format(playerId) + " has drawn a card."); 
    if (card) console.log(card);// To be implemented
    else {
        const temp = getStatNode(playerId, "cards")!;
        temp.textContent = (1 + Number(temp.textContent!)) as any as string;
    }
});
socket.on("change-money", (playerId: any, amount: number)=>{
    console.log(format(playerId) + "'s money has changed by " + amount);
    const temp = getStatNode(playerId, "money")!;
    temp.textContent = (amount + Number(temp.textContent!)) as any as string;
});
// End new test code

socket.on("player-left-lobby", (id: string) => {
    console.log("Recieved 'player-left-lobby' with id="+id);
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