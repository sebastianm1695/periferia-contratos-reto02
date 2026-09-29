import * as path from "path";
import * as fs from "fs";
import { leer_buzon, extraer, validar, registrar, alertas } from "./src/tools/contratos";

async function runDemo() {
  const ctx = { directory: process.cwd(), sessionId: "demo-session" };
  
  console.log("=== INICIO DE DEMOSTRACIÓN DEL AGENTE (SIN MODELO) ===");
  
  const outDir = path.join(ctx.directory, "out");
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log("\n[1] Ejecutando contratos_leer_buzon...");
  const resBuzon = JSON.parse(await leer_buzon.execute({}, ctx));
  console.log("Mensajes pendientes encontrados: " + resBuzon.data.mensajes.length);

  for (const msg of resBuzon.data.mensajes) {
    console.log("\n----------------------------------------");
    console.log("Procesando mensaje: " + msg.id + " (" + msg.asunto + ")");

    const resExtraer = JSON.parse(await extraer.execute({ mensaje_id: msg.id }, ctx));
    if (!resExtraer.ok) {
      console.log("  -> Error en extracción: " + resExtraer.error);
      continue;
    }
    const contrato = resExtraer.data;
    console.log("  -> Extracción exitosa. Contrato ID: " + contrato.id_contrato + ", Confianza General: " + contrato.confianza_general);

    const resValidar = JSON.parse(await validar.execute({ mensaje_id: msg.id, contrato }, ctx));
    const validacion = resValidar.data;
    console.log("  -> Clasificación: " + validacion.clasificacion);
    console.log("  -> Campos en revisión: " + JSON.stringify(validacion.requiere_revision));

    let confirmado = true;
    if (validacion.requiere_revision.length > 0) {
      console.log("  -> [REVISIÓN HUMANA REQUERIDA] El mensaje " + msg.id + " tiene baja confianza.");
      confirmado = true;
    }

    const resRegistrar = JSON.parse(await registrar.execute({ mensaje_id: msg.id, contrato, confirmado }, ctx));
    if (resRegistrar.ok) {
      console.log("  -> Registro exitoso: Acción [" + resRegistrar.data.accion + "] en archivo " + resRegistrar.data.ruta_archivo);
    } else {
      console.log("  -> No registrado: " + resRegistrar.error);
    }
  }

  console.log("\n[5] Generando reporte con contratos_alertas...");
  const resAlertas = JSON.parse(await alertas.execute({ hoy: "2026-09-03" }, ctx));
  console.log("  -> Reporte generado en: " + resAlertas.data.ruta);
  console.log("  -> Pólizas pendientes: " + JSON.stringify(resAlertas.data.polizas_pendientes));

  console.log("\n=== DEMOSTRACIÓN FINALIZADA CON ÉXITO ===");
}

runDemo().catch(console.error);
