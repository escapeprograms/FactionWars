const socketTable:{[id: string]: SocketInfo} = {}


// A total of 36^4 = 1679616 clients can be supported before repeats happen
let clientNum = 0; 
// A random start position for client keys each time the server starts
const startPos = [Math.floor(Math.random()*36), Math.floor(Math.random()*36), Math.floor(Math.random()*36), Math.floor(Math.random()*36)];
// One of two ways to combine the random and nonrandom parts
const randFirst = Math.floor(Math.random() * 2);
// Returns an 8 character clientId, 4 of which are random and 4 of which are permuted so that there are no duplicates
function generateClientId():string {
    const genChar = () => (Math.floor(Math.random() * 36)).toString(36);
    let id = "";
    for (let i = (0-randFirst); i < (8 - randFirst); i++) {
        id += (i % 2 == 0) ? ((clientNum % 36 + Math.floor(clientNum / (36**(i/2 + 1))) + startPos[i/2]) % 36).toString(36) : genChar();
    }
    clientNum++;
    
    return id;
}