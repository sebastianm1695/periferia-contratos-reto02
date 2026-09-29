import { GoogleGenAI } from '@google/genai';
import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI();

const BUZON_DIR = path.join(process.cwd(), 'fixtures', 'reto-02', 'buzon');
const OUT_DIR = path.join(process.cwd(), 'out');
const MASTER_FILE = path.join(OUT_DIR, 'maestro-contratos.csv');
const REPORT_FILE = path.join(OUT_DIR, 'reporte-alertas.md');

app.use(express.json());

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

// Endpoint para procesar el buzón de forma autónoma desde la web
app.post('/api/procesar', async (req, res) => {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const mensajes = obtenerMensajesDelBuzon(BUZON_DIR);
  if (mensajes.length === 0) {
    return res.status(404).json({ error: 'No se encontraron carpetas de mensajes en el buzón.' });
  }

  const resultadosProceso = [];

  for (const msg of mensajes) {
    let correoRemitente = 'desconocido@periferia.com';
    if (msg.rutaCorreo && fs.existsSync(msg.rutaCorreo)) {
      try {
        const datosCorreo = JSON.parse(fs.readFileSync(msg.rutaCorreo, 'utf-8'));
        correoRemitente = datosCorreo.from || datosCorreo.remitente || datosCorreo.correo || correoRemitente;
      } catch (e) {}
    }

    let contenidoContrato = '';
    if (msg.rutaContrato && fs.existsSync(msg.rutaContrato)) {
      contenidoContrato = fs.readFileSync(msg.rutaContrato, 'utf-8');
    } else {
      continue;
    }

    let metadata;
    try {
      const promptTexto = "Analiza el contrato y extrae JSON estricto con: id, cliente, valor numerico, fecha_inicio, fecha_fin, tipo_contrato ('Nuevo', 'Actualizacion/Otrosí', 'Duplicado', 'Rechazado'), confianza_general de 0.0 a 1.0. Contenido: " + contenidoContrato;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: promptTexto }] }],
        config: { responseMimeType: 'application/json' }
      });

      metadata = response.text ? JSON.parse(response.text) : null;
    } catch (e) {
      metadata = null;
    }

    if (!metadata) {
      metadata = {
        id: msg.nombreCarpeta,
        cliente: 'Cliente Desconocido',
        valor: 0,
        tipo_contrato: 'Nuevo',
        confianza_general: 0.5
      };
    }

    if (!metadata.id || metadata.id === 'string') {
      metadata.id = msg.nombreCarpeta;
    }

    let estado = metadata.tipo_contrato || 'Nuevo';
    const observaciones: string[] = [];

    if (metadata.confianza_general < 0.8) {
      observaciones.push('Confianza general menor a 0.8: requiere revision humana.');
      estado = 'Revision Humana Pendiente';
    }

    if (fs.existsSync(MASTER_FILE)) {
      const maestroContenido = fs.readFileSync(MASTER_FILE, 'utf-8');
      if (maestroContenido.includes(metadata.id)) {
        estado = 'Duplicado Pendiente';
        observaciones.push('ID duplicado detectado: ' + metadata.id);
      }
    }

    if (!fs.existsSync(MASTER_FILE)) {
      fs.writeFileSync(MASTER_FILE, 'ID,Cliente,Valor,TipoContrato,EstadoFinal,RemitenteCorreo,Confianza,Observaciones\n', 'utf-8');
    }

    const obsTexto = observaciones.join(' | ');
    const linea = '"' + metadata.id + '","' + metadata.cliente + '",' + (metadata.valor || 0) + ',"' + metadata.tipo_contrato + '","' + estado + '","' + correoRemitente + '",' + metadata.confianza_general + ',"' + obsTexto + '"\n';
    fs.appendFileSync(MASTER_FILE, linea, 'utf-8');

    resultadosProceso.push({
      id: metadata.id,
      cliente: metadata.cliente,
      estado,
      confianza: metadata.confianza_general,
      observaciones
    });
  }

  let resumenMaestro = fs.existsSync(MASTER_FILE) ? fs.readFileSync(MASTER_FILE, 'utf-8') : '';
  fs.writeFileSync(REPORT_FILE, '# Reporte Web\n\n' + resumenMaestro, 'utf-8');

  res.json({
    mensaje: 'Procesamiento web completado exitosamente',
    procesados: resultadosProceso
  });
});

// Endpoint para consultar el maestro CSV
app.get('/api/maestro', (req, res) => {
  if (!fs.existsSync(MASTER_FILE)) {
    return res.status(404).json({ error: 'Aún no hay registros en el maestro.' });
  }
  const contenido = fs.readFileSync(MASTER_FILE, 'utf-8');
  res.send(contenido);
});

// Endpoint para aprobar/rechazar manualmente desde la web
app.post('/api/aprobar', (req, res) => {
  const { id, aprobar } = req.body;

  if (!fs.existsSync(MASTER_FILE)) {
    return res.status(404).json({ error: 'No existe el archivo maestro.' });
  }

  const lineas = fs.readFileSync(MASTER_FILE, 'utf-8').split('\n');
  let encontrado = false;

  const nuevasLineas = lineas.map(linea => {
    if (linea.includes('"' + id + '"')) {
      encontrado = true;
      const partes = linea.split(',');
      partes[4] = aprobar ? '"Aprobado Manualmente"' : '"Rechazado por Operador"';
      return partes.join(',');
    }
    return linea;
  });

  if (!encontrado) {
    return res.status(404).json({ error: 'Contrato con ID ' + id + ' no encontrado en el maestro.' });
  }

  fs.writeFileSync(MASTER_FILE, nuevasLineas.join('\n'), 'utf-8');
  res.json({ mensaje: 'Contrato ' + id + ' actualizado correctamente.' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log('Servidor web activo en el puerto ' + PORT);
});