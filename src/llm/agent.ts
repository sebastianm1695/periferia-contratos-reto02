import * as path from "path";
import * as fs from "fs";
import { leer_buzon, extraer, validar, registrar, alertas } from "../tools/contratos";

let cacheMensajesPendientes: any[] = [];
let contratoPendienteRevision: { msg: any; contrato: any; val: any } | null = null;

export async function ejecutarAgenteConversacional(mensajeUsuario: string): Promise<string> {
  const ctx = { directory: process.cwd(), sessionId: "chat-session-01" };
  const texto = mensajeUsuario.trim();
  const textoLower = texto.toLowerCase();

  try {
    // Si estamos esperando confirmación humana por baja confianza
    if (contratoPendienteRevision) {
      if (textoLower === "si" || textoLower.includes("confirmar") || textoLower.includes("procesar")) {
        const item = contratoPendienteRevision;
        contratoPendienteRevision = null; // Limpiar estado

        const resReg = JSON.parse(await registrar.execute({ mensaje_id: item.msg.id, contrato: item.contrato, confirmado: true }, ctx));
        if (resReg.ok) {
          return "✅ [Confirmación Humana Aceptada] Contrato [" + item.contrato.id_contrato + "] registrado exitosamente en SharePoint.";
        }
        return "❌ Error al registrar el contrato.";
      } else {
        contratoPendienteRevision = null;
        return "Operación cancelada por el usuario para el contrato en revisión.";
      }
    }

    // 1. Revisar buzón
    if (textoLower.includes("buzon") || textoLower.includes("contratos") || textoLower.includes("revisar")) {
      const resBuzon = JSON.parse(await leer_buzon.execute({}, ctx));
      cacheMensajesPendientes = resBuzon.data.mensajes;
      
      if (cacheMensajesPendientes.length === 0) {
        return "El buzón se encuentra al día. No hay mensajes pendientes por procesar.";
      }

      let respuesta = "He revisado el buzón. Selecciona el número del mensaje que deseas procesar o escribe 'todos':\n\n";
      cacheMensajesPendientes.forEach((msg, index) => {
        respuesta += "[" + (index + 1) + "] ID: " + msg.id + " | Asunto: " + msg.asunto + "\n";
      });
      return respuesta;
    }

    // 2. Selección por número o 'todos'
    const numeroSeleccionado = parseInt(texto, 10);
    if (!isNaN(numeroSeleccionado) || textoLower.includes("todos") || textoLower.includes("procesar")) {
      let mensajesAProcesar: any[] = [];

      if (!isNaN(numeroSeleccionado)) {
        if (cacheMensajesPendientes.length === 0) {
          const resBuzon = JSON.parse(await leer_buzon.execute({}, ctx));
          cacheMensajesPendientes = resBuzon.data.mensajes;
        }

        const index = numeroSeleccionado - 1;
        if (index >= 0 && index < cacheMensajesPendientes.length) {
          mensajesAProcesar = [cacheMensajesPendientes[index]];
        } else {
          return "Número inválido. Selecciona un número entre 1 y " + cacheMensajesPendientes.length + ".";
        }
      } else {
        const resBuzon = JSON.parse(await leer_buzon.execute({}, ctx));
        mensajesAProcesar = resBuzon.data.mensajes;
      }

      if (mensajesAProcesar.length === 0) {
        return "No hay mensajes disponibles para procesar.";
      }

      let logProceso = "";
      for (const msg of mensajesAProcesar) {
        const resExtraer = JSON.parse(await extraer.execute({ mensaje_id: msg.id }, ctx));
        if (!resExtraer.ok) continue;
        const contrato = resExtraer.data;

        const resValidar = JSON.parse(await validar.execute({ mensaje_id: msg.id, contrato }, ctx));
        const val = resValidar.data;

        // Validar CA3: Revisión humana obligatoria si hay baja confianza
        if (val.requiere_revision.length > 0) {
          contratoPendienteRevision = { msg, contrato, val };
          return "⚠️ [CA3 - REVISIÓN HUMANA REQUERIDA]\n" +
                 "El contrato [" + msg.id + "] (" + contrato.id_contrato + ") presenta baja confianza en los siguientes campos: " + JSON.stringify(val.requiere_revision) + ".\n" +
                 "¿Deseas confirmar y registrar este contrato de todas formas? (Escribe 'sí' para confirmar o 'no' para cancelar).";
        }

        const resReg = JSON.parse(await registrar.execute({ mensaje_id: msg.id, contrato, confirmado: true }, ctx));
        if (resReg.ok) {
          logProceso += "✅ Contrato [" + contrato.id_contrato + "] (" + val.clasificacion + ") registrado con éxito.\n";
        }
      }
      return logProceso + "\n¡Proceso de lotes finalizado!";
    }

    // 3. Generar alertas
    if (textoLower.includes("alerta") || textoLower.includes("reporte")) {
      const resAlerta = JSON.parse(await alertas.execute({ hoy: "2026-09-03" }, ctx));
      return "Reporte generado en '" + resAlerta.data.ruta + "'. Pólizas pendientes: " + JSON.stringify(resAlerta.data.polizas_pendientes);
    }

    return "Comandos disponibles: 'revisar el buzón', escribe un número de contrato, o 'generar alertas'.";
  } catch (error: any) {
    return "Error: " + error.message;
  }
}
