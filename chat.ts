import { GoogleGenAI } from '@google/genai';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const ai = new GoogleGenAI();
const PORT = process.env.PORT || 3000;

// Ruta del buzón administrativo
const BUZON_DIR = path.join(process.cwd(), 'fixtures', 'reto-02', 'buzon');

// Función para inspeccionar los archivos del buzón
function leerBuzon(): string[] {
  try {
    if (!fs.existsSync(BUZON_DIR)) {
      return ['Carpeta de buzon no encontrada en fixtures/reto-02/buzon'];
    }
    const archivos = fs.readdirSync(BUZON_DIR);
    return archivos.length > 0 ? archivos : ['El buzon esta actualmente vacio.'];
  } catch (error: any) {
    return [`Error leyendo el buzon: ${error.message}`];
  }
}

// Función para generar respuestas con el modelo de IA
async function generarRespuestaIA(prompt: string): Promise<string> {
  const modelos = ['gemini-2.5-flash'];
  for (const modelo of modelos) {
    try {
      const response = await ai.models.generateContent({
        model: modelo,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      if (response.text) return response.text;
    } catch (e) {
      // Intenta con el siguiente paso si ocurre error
    }
  }
  return 'Error de comunicacion con el modelo de IA en este momento.';
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`);

  // Endpoint del chat para procesar los mensajes del usuario
  if (parsedUrl.pathname === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        const lowerMsg = message.toLowerCase();

        let replyText = '';

        // Si el usuario solicita revisar el buzón o validar archivos
        if (lowerMsg.includes('buzon') || lowerMsg.includes('listar') || lowerMsg.includes('archivos') || lowerMsg.includes('validar')) {
          const archivosBuzon = leerBuzon();
          const promptBuzon = `Actúa como un Agente de Registro de Contratos profesional. Los archivos encontrados actualmente en el buzón (${BUZON_DIR}) son: ${JSON.stringify(archivosBuzon)}. Explica al usuario el estado de los documentos y el resultado de la validación inicial de los contratos pendientes.`;
          replyText = await generarRespuestaIA(promptBuzon);
        } else {
          // Conversación general con el agente
          const promptGeneral = `Actúa como un Agente de Registro de Contratos profesional. Responde de manera clara y directa a la siguiente consulta del usuario: ${message}`;
          replyText = await generarRespuestaIA(promptGeneral);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ reply: replyText }));
      } catch (error: any) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error.message || 'Error interno' }));
      }
    });
    return;
  }

  // Interfaz visual de chat interactivo
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Agente de Registro de Contratos</title>
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .chat-container { width: 100%; max-width: 650px; background: #1e293b; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column; height: 85vh; }
            h2 { margin-top: 0; font-size: 1.2rem; color: #38bdf8; text-align: center; border-bottom: 1px solid #334155; padding-bottom: 10px; }
            #chat-box { flex: 1; overflow-y: auto; border: 1px solid #334155; padding: 15px; border-radius: 8px; margin-bottom: 15px; background: #0f172a; display: flex; flex-direction: column; gap: 10px; }
            .message { padding: 10px 14px; border-radius: 8px; max-width: 85%; line-height: 1.4; white-space: pre-wrap; }
            .user { background: #0284c7; align-self: flex-end; }
            .bot { background: #334155; align-self: flex-start; }
            .quick-actions { display: flex; gap: 8px; margin-bottom: 10px; }
            .quick-btn { background: #334155; color: #38bdf8; border: 1px solid #0ea5e9; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
            .quick-btn:hover { background: #0ea5e9; color: #fff; }
            .input-group { display: flex; gap: 10px; }
            input { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; font-size: 1rem; }
            button.send { padding: 12px 20px; background: #0ea5e9; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
            button.send:hover { background: #0284c7; }
        </style>
    </head>
    <body>
        <div class="chat-container">
            <h2>Agente de Registro de Contratos</h2>
            <div id="chat-box">
                <div class="message bot">Hola. Soy tu agente asistente para la gestion de contratos. Escribe "revisar buzon" o haz clic en el boton rapido para inspeccionar los documentos pendientes.</div>
            </div>
            <div class="quick-actions">
                <button class="quick-btn" onclick="sendQuick('revisar buzon')">Revisar Buzon</button>
                <button class="quick-btn" onclick="sendQuick('validar contratos')">Validar Contratos</button>
            </div>
            <div class="input-group">
                <input type="text" id="userInput" placeholder="Escribe tu consulta o comando aqui..." autofocus />
                <button class="send" onclick="sendMessage()">Enviar</button>
            </div>
        </div>
        <script>
            async function sendQuick(text) {
                document.getElementById('userInput').value = text;
                await sendMessage();
            }

            async function sendMessage() {
                const input = document.getElementById('userInput');
                const chatBox = document.getElementById('chat-box');
                const text = input.value.trim();
                if (!text) return;

                chatBox.innerHTML += \`<div class="message user">\${text}</div>\`;
                input.value = '';
                chatBox.scrollTop = chatBox.scrollHeight;

                try {
                    const res = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text })
                    });
                    const data = await res.json();
                    const reply = data.reply || data.error || 'Sin respuesta';
                    chatBox.innerHTML += \`<div class="message bot">\${reply}</div>\`;
                } catch (e) {
                    chatBox.innerHTML += \`<div class="message bot">Error de conexion con el servidor.</div>\`;
                }
                chatBox.scrollTop = chatBox.scrollHeight;
            }
            document.getElementById('userInput').addEventListener('keypress', function (e) {
                if (e.key === 'Enter') sendMessage();
            });
        </script>
    </body>
    </html>
  `);
});

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Servidor de chat activo en el puerto ${PORT}`);
});