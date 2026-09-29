import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import { leer_buzon, extraer, validar, registrar, alertas } from "../tools/contratos";

// Inicializar el cliente de Gemini (usa la variable de entorno GEMINI_API_KEY)
const ai = new GoogleGenAI({ apiKey: "AQ.Ab8RN6IbakUHVeRNLP7ClTKIN2adoOqup5ZjnxWSEJQVgwtwCAQ" });

// Cargar el system prompt oficial del reto
function cargarSystemPrompt(): string {
  const promptPath = path.join(process.cwd(), "agent", "prompt.md");
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, "utf-8");
  }
  return "Eres un agente conversacional experto en la gestión, validación y registro de contratos corporativos para Periferia IT Group.";
}

// Definir las declaraciones de herramientas para que Gemini pueda invocarlas
const declarations: FunctionDeclaration[] = [
  {
    name: "leer_buzon",
    description: "Lee de forma determinista los mensajes de prueba del buzón administrativo.",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "extraer",
    description: "Extrae campos estructurados y niveles de confianza de un contrato a partir del ID de mensaje.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mensaje_id: { type: Type.STRING, description: "ID del mensaje (ej: msg-001)" }
      },
      required: ["mensaje_id"]
    }
  },
  {
    name: "validar",
    description: "Aplica reglas de negocio para clasificar contratos y detectar campos con baja confianza.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mensaje_id: { type: Type.STRING, description: "ID del mensaje" },
        contrato: { type: Type.OBJECT, description: "Objeto contrato extraído" }
      },
      required: ["mensaje_id", "contrato"]
    }
  },
  {
    name: "registrar",
    description: "Registra o actualiza el contrato en el archivo maestro CSV simulado de SharePoint y archiva documentos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mensaje_id: { type: Type.STRING, description: "ID del mensaje" },
        contrato: { type: Type.OBJECT, description: "Objeto contrato" },
        confirmado: { type: Type.BOOLEAN, description: "Confirmación humana obligatoria en caso de baja confianza" }
      },
      required: ["mensaje_id", "contrato"]
    }
  },
  {
    name: "alertas",
    description: "Genera el reporte en Markdown de pólizas pendientes y contratos próximos a vencer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        hoy: { type: Type.STRING, description: "Fecha actual de referencia (YYYY-MM-DD)" }
      }
    }
  }
];

// Mapeador para ejecutar la herramienta localmente cuando Gemini lo solicite
async function ejecutarHerramientaLocal(nombre: string, args: any): Promise<any> {
  const ctx = { directory: process.cwd(), sessionId: "chat-session-01" };
  switch (nombre) {
    case "leer_buzon":
      return await leer_buzon.execute(args, ctx);
    case "extraer":
      return await extraer.execute(args, ctx);
    case "validar":
      return await validar.execute(args, ctx);
    case "registrar":
      return await registrar.execute(args, ctx);
    case "alertas":
      return await alertas.execute(args, ctx);
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

// Historial de conversación en memoria para el chat
let historialChat: any[] = [];

export async function ejecutarAgenteConversacional(mensajeUsuario: string): Promise<string> {
  const systemInstruction = cargarSystemPrompt();

  if (historialChat.length === 0) {
    historialChat.push({ role: "user", parts: [{ text: mensajeUsuario }] });
  } else {
    historialChat.push({ role: "user", parts: [{ text: mensajeUsuario }] });
  }

  try {
    // Llamada al modelo Gemini con soporte de Function Calling
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: historialChat,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ functionDeclarations: declarations }],
        temperature: 0.1
      }
    });

    // Validar si el modelo decidió llamar a una herramienta
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const resultadoToolStr = await ejecutarHerramientaLocal(call.name, call.args);
      const resultadoToolJson = JSON.parse(resultadoToolStr);

      // Agregar la respuesta del modelo y la salida de la herramienta al historial
      historialChat.push({
        role: "model",
        parts: [{ functionCall: call }]
      });

      historialChat.push({
        role: "user",
        parts: [{ functionResponse: { name: call.name, response: { result: resultadoToolJson } } }]
      });

      // Segunda llamada a Gemini para que procese el resultado técnico y le hable al usuario
      const secondResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: historialChat,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.1
        }
      });

      const respuestaFinal = secondResponse.text || "Operación procesada exitosamente por el agente.";
      historialChat.push({ role: "model", parts: [{ text: respuestaFinal }] });
      return respuestaFinal;
    }

    const textoRespuesta = response.text || "Entendido.";
    historialChat.push({ role: "model", parts: [{ text: textoRespuesta }] });
    return textoRespuesta;

  } catch (error: any) {
    return `Error al conectar con el agente de Gemini: ${error.message}. (Verifica que tengas configurada tu variable de entorno GEMINI_API_KEY).`;
  }
}