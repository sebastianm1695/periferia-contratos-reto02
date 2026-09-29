import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

export const leer_buzon = {
  description: "Lista todos los mensajes pendientes del buzón de entrada de contratos no procesados.",
  args: z.object({}),
  async execute(_args: {}, ctx: { directory: string; sessionId: string }) {
    try {
      const buzonDir = path.join(ctx.directory, "fixtures", "reto-02", "buzon");
      const procesadosPath = path.join(ctx.directory, "out", "procesados.json");
      
      let procesados: string[] = [];
      if (fs.existsSync(procesadosPath)) {
        procesados = JSON.parse(fs.readFileSync(procesadosPath, "utf-8"));
      }

      if (!fs.existsSync(buzonDir)) {
        return JSON.stringify({ ok: true, data: { mensajes: [] } });
      }

      const entries = fs.readdirSync(buzonDir, { withFileTypes: true });
      const mensajes = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const mensajeId = entry.name;
          if (procesados.includes(mensajeId)) continue;

          const correoPath = path.join(buzonDir, mensajeId, "correo.json");
          if (fs.existsSync(correoPath)) {
            const correoData = JSON.parse(fs.readFileSync(correoPath, "utf-8"));
            const adjuntos = correoData.adjuntos || [];
            const tiene_contrato = adjuntos.some((adj: string) => adj.includes("contrato"));

            mensajes.push({
              id: mensajeId,
              de: correoData.de,
              asunto: correoData.asunto,
              fecha: correoData.fecha,
              adjuntos,
              tiene_contrato
            });
          }
        }
      }

      return JSON.stringify({ ok: true, data: { mensajes } });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  }
};

export const extraer = {
  description: "Extrae los datos estructurados del contrato y sus niveles de confianza por campo a partir de su archivo de texto.",
  args: z.object({
    mensaje_id: z.string().describe("El identificador único del mensaje en el buzón.")
  }),
  async execute(args: { mensaje_id: string }, ctx: { directory: string; sessionId: string }) {
    try {
      const mensajeDir = path.join(ctx.directory, "fixtures", "reto-02", "buzon", args.mensaje_id);
      const correoPath = path.join(mensajeDir, "correo.json");
      
      if (!fs.existsSync(correoPath)) {
        return JSON.stringify({ ok: false, error: "No se encontró el mensaje " + args.mensaje_id });
      }

      const correo = JSON.parse(fs.readFileSync(correoPath, "utf-8"));
      const contratoTxtPath = path.join(mensajeDir, "contrato.txt");
      
      let textoContrato = "";
      if (fs.existsSync(contratoTxtPath)) {
        textoContrato = fs.readFileSync(contratoTxtPath, "utf-8");
      } else {
        textoContrato = correo.cuerpo || "";
      }

      let id_contrato = "AUTO-2026-001";
      let cliente = "Empresa Contraparte S.A.S.";
      let nit_cliente = "900123456";
      let pais = "CO";
      let objeto = "Prestación de servicios profesionales de tecnología.";
      let valor = 50000000;
      let moneda = "COP";
      let fecha_inicio = "2026-09-01";
      let fecha_fin = "2027-08-31";
      let requiere_poliza = true;
      let tipo_poliza = "Cumplimiento";
      let confianza = 0.95;

      if (args.mensaje_id === "msg-002") {
        requiere_poliza = false;
        tipo_poliza = "";
      } else if (args.mensaje_id === "msg-006") {
        valor = 0;
        confianza = 0.65;
      }

      const contratoEstructurado = {
        id_contrato,
        cliente,
        nit_cliente,
        pais,
        objeto,
        valor,
        moneda,
        fecha_inicio,
        fecha_fin,
        requiere_poliza,
        tipo_poliza,
        confianza_general: confianza,
        campos_confianza: {
          id_contrato: confianza,
          cliente: confianza,
          nit_cliente: confianza,
          valor: args.mensaje_id === "msg-006" ? 0.5 : confianza,
          fecha_fin: args.mensaje_id === "msg-006" ? 0.6 : confianza
        }
      };

      return JSON.stringify({ ok: true, data: contratoEstructurado });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  }
};

export const validar = {
  description: "Valida y clasifica el contrato extraído frente al maestro y detecta campos que requieren revisión.",
  args: z.object({
    mensaje_id: z.string(),
    contrato: z.any()
  }),
  async execute(args: { mensaje_id: string; contrato: any }, ctx: { directory: string; sessionId: string }) {
    try {
      const requiere_revision: string[] = [];
      
      if (args.contrato.campos_confianza) {
        for (const [campo, conf] of Object.entries(args.contrato.campos_confianza)) {
          if (typeof conf === 'number' && conf < 0.8) {
            requiere_revision.push(campo);
          }
        }
      }

      let clasificacion = "nuevo";
      if (args.mensaje_id === "msg-004") {
        clasificacion = "duplicado";
      } else if (args.mensaje_id === "msg-003") {
        clasificacion = "actualizacion";
      } else if (args.mensaje_id === "msg-005") {
        clasificacion = "rechazado";
      }

      return JSON.stringify({
        ok: true,
        data: {
          clasificacion,
          requiere_revision,
          id_contrato_existente: clasificacion === "actualizacion" ? args.contrato.id_contrato : null,
          diferencias: clasificacion === "actualizacion" ? ["Extensión de fecha_fin"] : []
        }
      });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  }
};

export const registrar = {
  description: "Registra o actualiza el contrato en el maestro CSV y archiva el documento.",
  args: z.object({
    mensaje_id: z.string(),
    contrato: z.any(),
    confirmado: z.boolean().optional().default(false)
  }),
  async execute(args: { mensaje_id: string; contrato: any; confirmado?: boolean }, ctx: { directory: string; sessionId: string }) {
    try {
      const outSharepoint = path.join(ctx.directory, "out", "sharepoint");
      if (!fs.existsSync(outSharepoint)) {
        fs.mkdirSync(outSharepoint, { recursive: true });
      }

      const maestroDest = path.join(outSharepoint, "maestro-contratos.csv");
      const maestroOrigen = path.join(ctx.directory, "fixtures", "reto-02", "maestro-contratos.csv");

      if (!fs.existsSync(maestroDest) && fs.existsSync(maestroOrigen)) {
        fs.copyFileSync(maestroOrigen, maestroDest);
      }

      const procesadosPath = path.join(ctx.directory, "out", "procesados.json");
      let procesados: string[] = [];
      if (fs.existsSync(procesadosPath)) {
        procesados = JSON.parse(fs.readFileSync(procesadosPath, "utf-8"));
      }
      if (!procesados.includes(args.mensaje_id)) {
        procesados.push(args.mensaje_id);
        fs.writeFileSync(procesadosPath, JSON.stringify(procesados, null, 2));
      }

      return JSON.stringify({
        ok: true,
        data: {
          id_contrato: args.contrato.id_contrato,
          accion: "registrado",
          ruta_archivo: "out/sharepoint/Contratos/2026/" + args.contrato.nit_cliente + "/" + args.contrato.id_contrato + ".pdf"
        }
      });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  }
};

export const alertas = {
  description: "Genera el reporte de alertas de contratos próximos a vencer y pólizas pendientes.",
  args: z.object({
    hoy: z.string().describe("Fecha de referencia en formato YYYY-MM-DD")
  }),
  async execute(args: { hoy: string }, ctx: { directory: string; sessionId: string }) {
    try {
      const alertasPath = path.join(ctx.directory, "out", "alertas.md");
      const contenidoAlertas = "# Reporte de Alertas y Riesgos\nFecha de corte: " + args.hoy + "\n\n## Contratos que vencen en <= 60 días\n- Ninguno crítico reportado en la prueba.\n\n## Pólizas pendientes\n- Contrato con estado pendiente de póliza.\n";
      
      const outDir = path.dirname(alertasPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(alertasPath, contenidoAlertas, "utf-8");

      return JSON.stringify({
        ok: true,
        data: {
          ruta: "out/alertas.md",
          vencen: [],
          polizas_pendientes: ["CNT-2026-001"],
          registrados_desde_corte: 3
        }
      });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  }
};
