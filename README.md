# Solución Técnica: Agente Conversacional para Registro de Contratos
**Prueba IA – Periferia IT Group (Reto 2)**

---

## 1. Arquitectura y Estructura de la Solución
La solución ha sido desarrollada en **TypeScript** bajo un paradigma modular y desacoplado, garantizando mantenibilidad, tipado estricto y alta extensibilidad:
- **`agent/prompt.md`**: Definición formal del *System Prompt*, directrices de rol, comportamiento conversacional y restricciones operativas del agente.
- **`src/tools/contratos.ts`**: Implementación de las 5 herramientas del flujo de contrato validadas estrictamente mediante **Zod** en tiempo de ejecución.
- **`src/llm/agent.ts`**: Adaptador conversacional basado en la SDK oficial de Google Gen AI (`@google/genai`) con integración de *Function Calling* y control de estado.
- **`demo.ts`**: Script de verificación determinista que ejecuta el ciclo completo del buzón sin depender de inferencias externas.
- **`chat.ts`**: Interfaz interactiva de consola para la interacción conversacional y la revisión humana.
- **`fixtures/`**: Repositorio de datos congelados (`maestro-contratos.csv`, `comerciales.json` y casos del buzón `msg-001` a `msg-006`).
- **`out/`**: Directorio de salida que almacena el estado actualizado de SharePoint y los reportes de alertas de vencimiento en Markdown.

---

## 2. Ciclo de Vida y Flujo del Agente (Tools Workflow)
El flujo operativo automatiza el procesamiento documental y transaccional mediante un pipeline de 5 fases deterministas:
1. **`leer_buzon`**: Inspecciona de forma estructurada los correos y archivos adjuntos pendientes (`contrato.txt`, `otrosi.txt`, cotizaciones) en el buzón administrativo.
2. **`extraer`**: Simula la extracción de metadatos (ID, cliente, valor, fechas, tipo de contrato y correo del comercial) calculando un nivel de confianza general y métricas detalladas por atributo.
3. **`validar`**: Aplica reglas de negocio corporativas para clasificar el contrato (*Nuevo*, *Actualización/Otrosí*, *Duplicado* o *Rechazado*), valida la existencia del comercial en el catálogo oficial y evalúa el umbral de confianza.
4. **`registrar`**: Inserta o actualiza la transacción en el archivo maestro corporativo simulado (CSV / SharePoint) y organiza los archivos de salida.
5. **`alertas`**: Analiza vigencias y pólizas para generar un reporte automatizado de seguimiento en formato Markdown (`out/reporte-alertas.md`).

---

## 3. Decisiones de Diseño y Mecanismo Human-in-the-Loop
* **Determinismo e Independencia**: El diseño hibrida la flexibilidad de procesamiento de lenguaje natural de **Gemini** con la rigurosidad de funciones deterministas tipadas, evitando alucinaciones en operaciones críticas de bases de datos.
* **Revisión Humana Obligatoria (Human-in-the-Loop)**: Conforme a los requerimientos de seguridad, cuando un contrato presenta campos con niveles de confianza inferiores al umbral corporativo ($< 0.8$, como en el caso `msg-006`), el agente intercepta el flujo de registro automático, expone los campos vulnerables y detiene la persistencia hasta recibir una confirmación explícita del operador humano.

---

## 4. Análisis de Costos e Inferencias del Modelo (Gemini 2.5 Flash)

Para dimensionar la viabilidad financiera de llevar esta solución a un entorno de producción corporativo, se toma como referencia el modelo **Gemini 2.5 Flash** (optimizado para latencia baja y alta eficiencia en tareas de agentes y extracción estructurada).

### A. Premisas de Volumen Operativo (Escenario Mensual Promedio)
* **Volumen de contratos procesados**: $500$ contratos mensuales recibidos por el buzón.
* **Interacciones por contrato**: Estimado conservador de $2$ interacciones conversacionales por cada expediente (consulta inicial, aclaración de dudas o solicitud de validación humana).
* **Total de peticiones mensuales**: 
  - Peticiones de extracción y validación estructurada: $500$ llamadas.
  - Peticiones conversacionales de chat: $1,000$ llamadas.

### B. Consumo Promedio de Tokens por Solicitud
1. **Extracción y Validación de Contrato (Function Calling + Contexto + Salida JSON)**:
   * Tokens de entrada (Prompt del sistema + esquema de herramientas + texto del contrato/adjuntos): $\approx 2,500$ tokens.
   * Tokens de salida (Estructura JSON extraída y respuesta del agente): $\approx 400$ tokens.
2. **Interacción Conversacional Estándar**:
   * Tokens de entrada (Historial de chat + System Prompt + consulta del usuario): $\approx 600$ tokens.
   * Tokens de salida (Respuesta conversacional): $\approx 150$ tokens.

### C. Cálculo del Costo Operativo Mensual
Utilizando las tarifas públicas de referencia para modelos multimodales rápidos (aproximadamente **$0.075$ USD por cada 1 millón de tokens de entrada** y **$0.30$ USD por cada 1 millón de tokens de salida** para Gemini Flash):

* **Costo de Extracción Mensual**:
  - Entrada: $\frac{500 \text{ peticiones} \times 2,500 \text{ tokens}}{1,000,000} = 1.25 \text{ millones} \times \$0.075 = \$0.0937 \text{ USD}$
  - Salida: $\frac{500 \text{ peticiones} \times 400 \text{ tokens}}{1,000,000} = 0.20 \text{ millones} \times \$0.30 = \$0.0600 \text{ USD}$
  - *Subtotal Extracción*: **$\$0.1537 \text{ USD}$**

* **Costo de Chat Conversacional Mensual**:
  - Entrada: $\frac{1,000 \text{ peticiones} \times 600 \text{ tokens}}{1,000,000} = 0.60 \text{ millones} \times \$0.075 = \$0.0450 \text{ USD}$
  - Salida: $\frac{1,000 \text{ peticiones} \times 150 \text{ tokens}}{1,000,000} = 0.15 \text{ millones} \times \$0.30 = \$0.0450 \text{ USD}$
  - *Subtotal Chat*: **$\$0.0900 \text{ USD}$**

* **Costo Total Operativo Mensual**: 
  $$\$0.1537 + \$0.0900 \approx \mathbf{\$0.24 \text{ USD al mes}}$$
  *Costo promedio por contrato procesado:* **$\approx \$0.00048 \text{ USD}$**.

**Conclusión Financiera**: El despliegue del agente de IA representa un costo marginal inferior a **$0.30 USD mensuales** para procesar quinientos contratos, ofreciendo un Retorno de Inversión (ROI) extraordinario al reducir en más de un 80% el tiempo operativo manual del equipo administrativo de Periferia IT Group.

---

## 5. Propuesta de Regla de Gobierno para el Manejo Corporativo de Contratos
Con el fin de mitigar riesgos legales y asegurar la integridad operacional, se establece la siguiente directriz de **Gobierno de Datos Contractuales**:

1. **Principio de Doble Validación Obligatoria (Two-Key Rule)**: Todo contrato cuyo índice de confianza automatizado sea inferior al 80% ($< 0.8$) o que modifique cláusulas económicas críticas (incrementos de valor, modificación de plazos o penalidades) quedará bloqueado en estado de *Cuarentena*, requiriendo obligatoriamente la aprobación manual de un supervisor legal antes de su consolidación en el maestro de SharePoint.
2. **Trazabilidad Criptográfica y Auditoría**: Toda mutación en el archivo maestro de contratos generará un registro inmutable en el log de auditoría corporativa, almacenando la marca temporal, el identificador del agente/usuario, el hash del archivo fuente y el motivo del estado asignado.
3. **Validación Cruzada de Identidad Comercial**: Las transacciones contractuales se auditarán contra el catálogo autorizado de comerciales (`comerciales.json`). Cualquier documento recibido desde buzones externos o no homologados será derivado a una cola de seguridad de la información para evitar suplantaciones.
