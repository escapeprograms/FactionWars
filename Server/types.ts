type Faction = "T" | "M" | "S" | "A";
enum Team {
    Red = 0,
    Blue = 1
}
type User = {
    socketId: string,
    faction: Faction,
    team: Team,
    name: string // add size limit, maybe truncate at size limit automatically (and also prevent limit on client side)
};
type Lobby = {
    users: User[],
    id: string,
    started: boolean
};