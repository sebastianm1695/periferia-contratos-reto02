import * as readline from "readline";
import { ejecutarAgenteConversacional } from "./src/llm/agent";
import http from 'http';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('¡Agente de Registro de Contratos Activo y Operativo para Periferia IT Group!\n');
});

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Servidor HTTP escuchando en el puerto ${PORT}`);
});
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("=== CHAT INTERACTIVO CON EL AGENTE DE CONTRATOS ===");
console.log("Escribe tu consulta (ej. 'revisa el buzón de contratos') o 'salir' para terminar.\n");

function preguntar() {
  rl.question("Usuario: ", async (input) => {
    if (input.toLowerCase() === "salir") {
      console.log("¡Hasta luego!");
      rl.close();
      return;
    }

    const respuesta = await ejecutarAgenteConversacional(input);
    console.log("Agente: " + respuesta + "\n");
    preguntar();
  });
}

preguntar();
