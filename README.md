# TAI Tests

App de tests de estudio: móvil y escritorio, con repetición espaciada, feedback inmediato
y meta diaria de 1 hora. Diseñada para costar **0 €/mes**.

- **Frontend**: Vite + React + TypeScript + Tailwind → estático, cabe en cualquier free tier.
- **Backend**: Supabase (PostgreSQL + auth por enlace mágico). Opcional.
- **Sin Supabase la app funciona igual**, guardando todo en el navegador del dispositivo.
  Supabase solo añade sincronizar el progreso entre el móvil y el ordenador.

---

## 1. Probarla en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Ve a **Contenido → Elegir archivo** y elige
`data/ejemplo.pack.json` para tener preguntas con las que jugar.

## 2. Desplegarla en internet con progreso sincronizado

Guía paso a paso, con el orden que importa: **[DESPLIEGUE.md](DESPLIEGUE.md)**.

Resumen: Supabase (base de datos, plan Free) + Vercel (hosting, plan Hobby). Coste 0 €,
sin tarjeta. Sin Supabase la app funciona igual, pero el progreso se queda en cada
dispositivo por separado.

---

## 3. Cargar contenido

Formatos aceptados: **Markdown** (`.md`), texto (`.txt`), **PDF** y packs `.json`.

### Cómo sabe la app qué le estás dando

No lo decide por la extensión ni por el botón que pulses: **mira el contenido**.
[`src/lib/markdown.ts`](src/lib/markdown.ts) busca tandas de opciones (`a) b) c) d)`,
`- [x] …`) y calcula qué parte del documento ocupan:

| Lo que ve | Qué decide | Qué hace |
|---|---|---|
| Preguntas con opciones en **más del 50%** del texto | Banco de preguntas | Las importa **tal cual**, sin llamar a ningún modelo ni pedir clave |
| Preguntas sueltas en **menos del 50%** | Temario con un cuestionario dentro | Descarta ese cuestionario y **genera** preguntas nuevas |
| Ninguna pregunta | Temario | Genera preguntas |

Siempre te enseña qué ha decidido, con qué confianza y por qué, **antes de tocar
nada**. Si baja del 75% el panel se pone ámbar. Dos botones —*Importar tal cual* y
*Generar preguntas*— te dejan corregirla en un clic; en la terminal es
`--modo banco|temario`.

### Preguntas que ya tienes escritas

Copia [`data/plantilla-preguntas.md`](data/plantilla-preguntas.md): lleva dentro los
formatos admitidos. En resumen, cada pregunta necesita enunciado, 4 opciones y **alguna**
de estas formas de marcar la correcta:

```markdown
- [x] Tres meses            ← casilla marcada
b) **Diez días**            ← negrita, ✓, o «(correcta)»
Respuesta: b                ← metadato tras las opciones
```

…o, si numeras los enunciados, un solucionario al final:

```markdown
## Soluciones
1-b 2-b 3-c
```

También reconoce `Explicación:` / `Justificación:` (o una cita `> …`) y
`Fuente:` / `Artículo:`; si no hay fuente, usa el encabezado padre.
**Si una pregunta no deja claro cuál es la correcta, la app no lo adivina**: la deja
fuera y te la lista para que la arregles.

#### Preguntas en unas páginas y respuestas en otras

Es el caso habitual de un cuaderno, y está resuelto: da igual cuántas páginas separen el
cuestionario de su solucionario. Lo importante es **cómo se emparejan cuando hay varios
solucionarios**, porque muchos cuadernos reinician la numeración en cada tema y entonces
el «1» del tema 2 choca con el «1» del tema 1.

La regla es: **cada solucionario responde a las preguntas que lo preceden**, hasta el
solucionario anterior. Si solo hay uno en todo el documento, vale para todas. Si una
pregunta no encaja con ninguno, se descarta con aviso en lugar de asignarle una respuesta
de otro tema.

Antes de importar verás el recuento —cuántas preguntas se han encontrado, cuántas entran
y cuántas quedan fuera— y cuántas respuestas trae cada solucionario. **Si un solucionario
tiene más respuestas que preguntas localizadas, te avisa**: es la señal de que el archivo
perdió alguna al convertirse.

### Temario del que hay que generar preguntas

Dos caminos, con las mismas reglas:

**Desde el ordenador** (recomendado, no expone la clave):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run cargar -- ruta/al/temario.md --tema "Ley 39/2015 — Título IV"
```

Escribe `data/<tema>.pack.json`. Impórtalo desde **Contenido → Elegir archivo**.

**Desde la propia app**: en **Contenido**, elige el archivo y pulsa *Generar*. Pide la
clave de Anthropic, que se guarda solo en ese navegador.

#### Las dos reglas del generador

1. **No recicla cuestionarios del documento.** Antes de generar nada,
   [`src/lib/extraer.ts`](src/lib/extraer.ts) elimina los tests de autoevaluación, los
   solucionarios y las plantillas de respuestas que ya trae el cuaderno. La pantalla te
   dice cuántos bloques ha descartado.
2. **Cubre todo el documento.** El texto limpio se trocea por artículos; si no los hay,
   por encabezados Markdown (eligiendo el nivel que da más unidades sin trocear demasiado
   fino); si tampoco, por epígrafes. Cada unidad recibe un cupo según su longitud, y si
   tras la primera pasada alguna se quedó sin preguntas, se reintenta esa unidad sola.
   El resultado te informa de la cobertura final.

Reimportar el mismo archivo **no pierde progreso**: el id de cada pregunta es un hash de
su enunciado, así que actualiza en lugar de duplicar.

---

## Dónde se guardan tus datos

Depende de si has configurado Supabase:

| | Sin Supabase | Con Supabase |
|---|---|---|
| Dónde | `localStorage` del navegador que uses | Postgres de Supabase, en la UE |
| Quién lo ve | Solo ese dispositivo | Solo tú: las políticas RLS atan progreso y sesiones a tu `auth.uid()` |
| Móvil y portátil | **No se sincronizan**: cada uno lleva su copia | Se sincronizan |
| Si borras datos del navegador | **Se pierde** | Se conserva |

Se guardan cuatro cosas: temas, preguntas, tu progreso por pregunta (aciertos, fallos,
caja y próxima revisión) y el tiempo diario. **Nada sale de ahí**: no hay analítica ni
terceros. La única salida a internet es, si generas preguntas, el texto que envías a la
API de Anthropic.

Sin Supabase, haz copias con **Contenido → Exportar copia de seguridad**: baja un JSON
con todos tus temas y preguntas.

## Borrar cosas

En **Contenido**, cada tema tiene **Ver** y **Borrar**:

- **Borrar** el tema elimina el tema, sus preguntas y tu progreso en ellas.
- **Ver** abre el listado del tema, donde puedes buscar, seleccionar preguntas sueltas
  con la casilla y borrarlas, o **reiniciar tu progreso** en las que se muestran
  (pone a cero aciertos y fallos, conservando las preguntas).

Todo pide confirmación. Reimportar un archivo no duplica: actualiza las preguntas que ya
existían y conserva su progreso.

## Abrirlo en el móvil

Una vez desplegado, abre en el navegador del móvil la URL que te dé Vercel
(algo como `https://tai-tests.vercel.app`) y añádela a la pantalla de inicio:

- **iPhone (Safari)**: botón Compartir → *Añadir a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.

Queda como una app a pantalla completa, sin barra del navegador. Si usas Supabase,
entra con tu correo y verás el mismo progreso que en el ordenador.

**Antes de desplegar**, para probarlo desde el móvil en tu red local:

```bash
npm run dev -- --host
```

Vite imprime una URL `http://192.168.x.x:5173` que puedes abrir desde el móvil estando
en el mismo wifi.

## Cómo decide qué preguntarte

Cajas de Leitner con 6 niveles. Un acierto sube de caja y aleja la siguiente revisión
(0, 1, 2, 4, 8 y 16 días); **un fallo devuelve la pregunta a la caja 0 y vuelve a
salirte ese mismo día**. Una pregunta se marca como dominada tras 5 aciertos espaciados.
El orden de una sesión es: falladas → nuevas → repasos vencidos.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila a `dist/` |
| `npm run preview` | Sirve `dist/` en local |
| `npm run typecheck` | Comprueba tipos |
| `npm run cargar -- <archivo>` | Importa o genera un pack desde .md, .txt o PDF |
