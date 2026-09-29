import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const ai = new GoogleGenAI();

const BUZON_DIR = path.join(process.cwd(), 'fixtures', 'reto-02', 'buzon');
const OUT_DIR = path.join(process.cwd(), 'out');
const MASTER_FILE = path.join(OUT_DIR, 'maestro-contratos.csv');
const REPORT_FILE = path.join(OUT_DIR, 'reporte-alertas.md');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function preguntarAlOperador(pregunta: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(pregunta, respuesta => {
      rl.close();
      resolve(respuesta.trim().toLowerCase());
    });
  });
}

// Estructura para agrupar los archivos por cada carpeta msg-xxx
interface CarpetaMensaje {
  nombreCarpeta: string;
  rutaContrato?: string;
  rutaCorreo?: string;
}

function obtenerMensajesDelBuzon(dir: string): CarpetaMensaje[] {
  let mensajes: CarpetaMensaje[] = [];
  if (!fs.existsSync(dir)) return mensajes;

  const elementos = fs.readdirSync(dir, { withFileTypes: true });
  for (const elemento of elementos) {
    const rutaElemento = path.join(dir, elemento.name);
    if (elemento.isDirectory()) {
      // Listar archivos dentro de cada carpeta msg-xxx
      const subElementos = fs.readdirSync(rutaElemento);
      const carpetaMsg: CarpetaMensaje = { nombreCarpeta: elemento.name };

      for (const sub of subElementos) {
        if (sub.toLowerCase().includes('contrato') || sub.toLowerCase().endsWith('.txt')) {
          carpetaMsg.rutaContrato = path.join(rutaElemento, sub);
        }
        if (sub.toLowerCase().includes('correo') || sub.toLowerCase().endsWith('.json')) {
          carpetaMsg.rutaCorreo = path.join(rutaElemento, sub);
        }
      }

      if (carpetaMsg.rutaContrato || carpetaMsg.rutaCorreo) {
        mensajes.push(carpetaMsg);
      }
    }
  }
  return mensajes;
}

async function validarPipelineConHumanInTheLoop() {
  console.log('--- INICIANDO VALIDACION CON HUMAN-IN-THE-LOOP ---');

  if (!fs.existsSync(BUZON_DIR)) {
    console.error(`Error: La carpeta del buzon no existe en ${BUZON_DIR}`);
    return;
  }
  
  const mensajes = obtenerMensajesDelBuzon(BUZON_DIR);
  
  if (mensajes.length === 0) {
    console.log('Aviso: No se encontraron carpetas de mensajes en el buzon.');
    return;
  }

  console.log('[1. leer_buzon] Mensajes detectados en carpetas msg-xxx:');
  mensajes.forEach((item, index) => {
    console.log(`  [${index + 1}] Carpeta: ${item.nombreCarpeta} (Contrato:${item.rutaContrato ? 'Sí' : 'No'}, Correo JSON: ${item.rutaCorreo ? 'Sí' : 'No'})`);
  });

  for (const msg of mensajes) {
    console.log('\n----------------------------------------');
    console.log(`Procesando mensaje de la carpeta: ${msg.nombreCarpeta}`);

    // Leer correo.json para extraer el remitente real
    let correoRemitente = 'desconocido@periferia.com';
    if (msg.rutaCorreo && fs.existsSync(msg.rutaCorreo)) {
      try {
        const datosCorreo = JSON.parse(fs.readFileSync(msg.rutaCorreo, 'utf-8'));
        correoRemitente = datosCorreo.from || datosCorreo.remitente || datosCorreo.correo || correoRemitente;
      } catch (e) {
        console.log(`Aviso: No se pudo parsear el archivo JSON de correo en ${msg.nombreCarpeta}`);
      }
    }

    // Leer contrato.txt
    let contenidoContrato = '';
    if (msg.rutaContrato && fs.existsSync(msg.rutaContrato)) {
      contenidoContrato = fs.readFileSync(msg.rutaContrato, 'utf-8');
    } else {
      console.log(`Aviso: No se encontró archivo de contrato legible en ${msg.nombreCarpeta}`);
      continue;
    }

    // 2. extraer con Gemini
    console.log('[2. extraer] Extrayendo metadatos del contrato con Gemini...');
    let metadata;
    try {
      const prompt = `Analiza el siguiente texto de contrato u otrosí corporativo y extrae los metadatos en un objeto JSON estricto con las siguientes claves:
      - id (string, ID o número de contrato si se menciona, o usa el nombre de la carpeta si no hay)
      - cliente (string)
      - valor (número)
      - fecha_inicio (YYYY-MM-DD)
      - fecha_fin (YYYY-MM-DD)
      - tipo_contrato (debe ser exactamente "Nuevo", "Actualización/Otrosí", "Duplicado" o "Rechazado")
      - confianza_general (número flotante de 0.0 a 1.0 según la claridad de los datos)
      - metricas_detalladas (objeto con confianza individual para cada atributo)

      Texto del contrato:
      ${contenidoContrato}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' }
      });

      metadata = response.text ? JSON.parse(response.text) : null;
    } catch (e) {
      console.log(`Aviso: Error en IA, aplicando fallback para ${msg.nombreCarpeta}`);
    }

    if (!metadata) {
      metadata = {
        id: msg.nombreCarpeta,
        cliente: 'Cliente Desconocido',
        valor: 0,
        fecha_inicio: '2026-01-01',
        fecha_fin: '2026-12-31',
        tipo_contrato: 'Nuevo',
        confianza_general: 0.5,
        metricas_detalladas: { id: 0.5, cliente: 0.5, valor: 0.5, fechas: 0.5, tipo: 0.5 }
      };
    }

    // Asegurar que el ID use el de la carpeta si la IA devolvió algo genérico
    if (!metadata.id || metadata.id === 'string') {
      metadata.id = msg.nombreCarpeta;
    }

    console.log(`  -> ID Contrato: ${metadata.id}`);
    console.log(`  -> Cliente: ${metadata.cliente}`);
    console.log(`  -> Remitente (correo.json): ${correoRemitente}`);
    console.log(`  -> Confianza General: ${(metadata.confianza_general * 100).toFixed(0)}%`);

    // 3. validar reglas de negocio
    console.log('[3. validar] Aplicando reglas de negocio corporativas...');
    let estado = metadata.tipo_contrato || 'Nuevo';
    const observaciones: string[] = [];

    if (metadata.confianza_general < 0.8) {
      observaciones.push('Confianza general menor a 0.8: requiere revision humana.');
      estado = 'Revision Humana';
    }

    if (fs.existsSync(MASTER_FILE)) {
      const maestroContenido = fs.readFileSync(MASTER_FILE, 'utf-8');
      if (maestroContenido.includes(metadata.id)) {
        estado = 'Duplicado';
        observaciones.push(`ID duplicado detectado: ${metadata.id}`);
      }
    }

    console.log(`  -> Estado preliminar: [${estado}]`);
    if (observaciones.length > 0) {
      console.log('  -> Observaciones detectadas:', observaciones);
    }

    // Mecanismo Human-in-the-Loop obligatorio si requiere revisión o duplicado
    if (estado === 'Revision Humana' || estado === 'Duplicado') {
      console.log(`\n[HUMAN-IN-THE-LOOP REQUERIDO] El contrato ${metadata.id} requiere validacion manual.`);
      const respuesta = await preguntarAlOperador('Deseas aprobar y registrar de todos modos este contrato en el maestro? (s/n): ');
      
      if (respuesta !== 's' && respuesta !== 'si') {
        console.log(`Operación cancelada por el operador. El contrato ${metadata.id} fue marcado como Rechazado/Omitido.`);
        continue;
      }
      console.log('Aprobado manualmente por el operador. Continuando con el registro...');
      estado = 'Aprobado Manualmente';
    }

    // 4. registrar en maestro CSV
    console.log('[4. registrar] Guardando transacción en maestro CSV...');
    if (!fs.existsSync(MASTER_FILE)) {
      fs.writeFileSync(MASTER_FILE, 'ID,Cliente,Valor,TipoContrato,EstadoFinal,RemitenteCorreo,Confianza,Observaciones\n', 'utf-8');
    }
    const obsTexto = observaciones.join(' | ');
    const linea = `"${metadata.id}","${metadata.cliente}",${metadata.valor},"${metadata.tipo_contrato}","${estado}","${correoRemitente}",${metadata.confianza_general},"${obsTexto}"\n`;
    fs.appendFileSync(MASTER_FILE, linea, 'utf-8');
    console.log(`  -> Registrado correctamente en ${MASTER_FILE}`);
  }

  // 5. reporte de alertas
  console.log('\n[5. alertas] Generando reporte consolidado en Markdown...');
  let resumenMaestro = 'Sin registros en maestro.';
  if (fs.existsSync(MASTER_FILE)) {
    resumenMaestro = fs.readFileSync(MASTER_FILE, 'utf-8');
  }
  const contenidoMarkdown = `# Reporte Automatizado de Alertas y Vigencias\n**Fecha:** ${new Date().toISOString().split('T')[0]}\n\n\`\`\`csv\n${resumenMaestro}\n\`\`\``;
  fs.writeFileSync(REPORT_FILE, contenidoMarkdown, 'utf-8');

  console.log('--- PROCESO COMPLETADO EXITOSAMENTE ---');
}

validarPipelineConHumanInTheLoop();