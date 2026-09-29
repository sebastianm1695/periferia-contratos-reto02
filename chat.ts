import { GoogleGenAI } from '@google/genai';
import http from 'http';
import { URL } from 'url';

// Inicializar el cliente de Gemini usando la variable de entorno de Render
const ai = new GoogleGenAI();
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '', `http://${req.headers.host}`);

  // Endpoint para procesar los mensajes del chat vía API interna
  if (parsedUrl.pathname === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        
        // Llamada directa y limpia al modelo oficial actual
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: `Actúa como un Agente de Registro de Contratos profesional para Periferia IT Group. Responde de manera clara y directa a la siguiente consulta del usuario: ${message}` }] }
          ]
        });

        const replyText = response.text || 'No se obtuvo respuesta del modelo.';

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ reply: replyText }));
      } catch (error: any) {
        console.error('Error detallado de Gemini:', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Error al comunicarse con la IA: ' + (error.message || 'Desconocido') }));
      }
    });
    return;
  }

  // Interfaz visual HTML para interactuar con el agente en el navegador
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Agente de Registro de Contratos - Periferia IT</title>
        <style>
            body { font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .chat-container { width: 100%; max-width: 600px; background: #1e293b; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column; height: 80vh; }
            h2 { margin-top: 0; font-size: 1.2rem; color: #38bdf8; text-align: center; border-bottom: 1px solid #334155; padding-bottom: 10px; }
            #chat-box { flex: 1; overflow-y: auto; border: 1px solid #334155; padding: 15px; border-radius: 8px; margin-bottom: 15px; background: #0f172a; display: flex; flex-direction: column; gap: 10px; }
            .message { padding: 10px 14px; border-radius: 8px; max-width: 80%; line-height: 1.4; white-space: pre-wrap; }
            .user { background: #0284c7; align-self: flex-end; }
            .bot { background: #334155; align-self: flex-start; }
            .input-group { display: flex; gap: 10px; }
            input { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; font-size: 1rem; }
            button { padding: 12px 20px; background: #0ea5e9; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
            button:hover { background: #0284c7; }
        </style>
    </head>
    <body>
        <div class="chat-container">
            <h2>Agente de Registro de Contratos - Periferia IT</h2>
            <div id="chat-box">
                <div class="message bot">¡Hola! Soy tu agente de contratos. ¿En qué puedo ayudarte hoy para el registro o validación?</div>
            </div>
            <div class="input-group">
                <input type="text" id="userInput" placeholder="Escribe tu consulta aquí..." autofocus />
                <button onclick="sendMessage()">Enviar</button>
            </div>
        </div>
        <script>
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
                    chatBox.innerHTML += \`<div class="message bot">Error de conexión con el servidor.</div>\`;
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
  console.log(`Servidor Web Interactivo escuchando en el puerto ${PORT}`);
});