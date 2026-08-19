# Desplegar TAI Tests con progreso sincronizado

Resultado: una URL pública (`https://algo.vercel.app`) que abres desde el móvil y el
portátil, con el mismo progreso en los dos. **Coste 0 €**, sin tarjeta.

Son dos servicios porque hacen cosas distintas: **Vercel** sirve la web y **Supabase**
guarda tu progreso. Ambos tienen plan gratuito de sobra para esto.

> El orden importa en un punto: Supabase necesita saber la URL de Vercel, que no
> existe hasta que despliegas. Por eso el paso 4 va después del 3.

---

## 1. Crear la base de datos (Supabase)

1. Entra en <https://supabase.com> → **Start your project** → crea la cuenta.
2. **New project**:
   - *Name*: `tai-tests`
   - *Database password*: genera una y **guárdala en tu gestor de contraseñas**. No la
     necesitarás para esto, pero sin ella no podrás administrar la base de datos luego.
   - *Region*: **Frankfurt** o **Ireland** (tus datos se quedan en la UE y va más rápido).
3. Espera a que termine de provisionarse (1-2 min).
4. Menú lateral → **SQL Editor** → **New query**. Pega **todo** el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
   Debe decir *Success. No rows returned*.

Esto crea las cuatro tablas y las políticas de seguridad que atan tu progreso a tu
usuario. Puedes volver a ejecutarlo cuando quieras: es idempotente y no borra nada.

## 2. Copiar las credenciales

En **Project Settings → API** copia dos valores:

| Valor | Dónde está | Para qué |
|---|---|---|
| **Project URL** | arriba, `https://xxxxx.supabase.co` | `VITE_SUPABASE_URL` |
| **anon public** | en *Project API keys* | `VITE_SUPABASE_ANON_KEY` |

> ⚠️ Copia la clave **`anon` / `public`**, nunca la **`service_role`**. La `anon` está
> pensada para ir en el navegador y por sí sola no da acceso a nada: lo que protege tus
> datos son las políticas RLS del paso 1. La `service_role` se salta esas políticas, así
> que no debe salir nunca del servidor.

## 3. Publicar la web (Vercel)

Desde esta carpeta, y en este orden:

```bash
npx vercel login
```

```bash
npx vercel link
```

Acepta crear un proyecto nuevo; el nombre que le des será tu URL. Ahora las dos
variables — te pedirá pegar el valor de cada una, y son las del paso 2:

```bash
npx vercel env add VITE_SUPABASE_URL production
```

```bash
npx vercel env add VITE_SUPABASE_ANON_KEY production
```

Y despliega:

```bash
npx vercel --prod
```

Al terminar te imprime la URL pública. **Cópiala**, hace falta ya.

> Las variables se incrustan al compilar, por eso van antes del despliegue. Si las
> cambias después, hay que volver a lanzar `npx vercel --prod`.

## 4. Autorizar esa URL en Supabase

Sin este paso el enlace de acceso por correo no funcionará.

En Supabase → **Authentication → URL Configuration**:

- **Site URL**: la URL de Vercel (`https://tu-proyecto.vercel.app`)
- **Redirect URLs**: añade la misma, y también `http://localhost:5173` si quieres
  seguir entrando en local.

Guarda. No hace falta volver a desplegar: es configuración del servidor.

## 5. Entrar y cargar tus contenidos

1. Abre la URL, escribe tu correo y pulsa **Enviarme el enlace**.
2. Te llega un correo de Supabase; **ábrelo en el mismo dispositivo**.
3. Ya dentro, ve a **Contenido → Elegir archivo** y sube tus `.md`.
4. Repite el acceso en el móvil con el mismo correo: verás lo mismo.

## 6. Dejarlo como app en el móvil

- **iPhone (Safari)**: Compartir → *Añadir a pantalla de inicio*
- **Android (Chrome)**: ⋮ → *Añadir a pantalla de inicio*

Queda a pantalla completa, sin barra del navegador.

---

## Actualizar la web más adelante

```bash
npx vercel --prod
```

O conecta el repo desde el panel de Vercel (**Settings → Git**) y se desplegará solo con
cada `git push`.

## Cosas que te vas a encontrar

**«No se ha podido contactar con la base de datos»** — el plan gratuito de Supabase
pausa el proyecto tras unos días sin usarlo. Entra en supabase.com y pulsa **Restore**;
tarda un minuto y no se pierde nada. Estudiando a diario no debería pasarte.

**El enlace del correo no entra** — casi siempre es el paso 4 sin hacer, o haber abierto
el enlace en un dispositivo distinto del que lo pidió.

**El correo no llega** — mira spam. El servidor de correo gratuito de Supabase limita a
unos pocos envíos por hora; si has probado varias veces seguidas, espera un poco.

**Quiero llevarme mis datos** — **Contenido → Exportar copia de seguridad** baja un JSON
con todos tus temas y preguntas. El progreso vive en Supabase; puedes verlo y exportarlo
desde su **Table Editor**.
