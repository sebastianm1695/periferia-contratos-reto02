import * as readline from "readline";
import { ejecutarAgenteConversacional } from "./src/llm/agent";

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
