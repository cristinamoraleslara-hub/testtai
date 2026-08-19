# Desplegar TAI Tests con progreso sincronizado

Resultado: una URL pública (`https://algo.vercel.app`) que abres desde el móvil y el
portátil, con el mismo progreso en los dos. **Coste 0 €**, sin tarjeta.

Son dos servicios porque hacen cosas distintas: **Vercel** sirve la web y **Supabase**
guarda tu progreso. Ambos tienen plan gratuito de sobra para esto.

> El acceso es con correo y contraseña, verificada por el servidor de Supabase. La
> contraseña no está en el código: este bundle es público y cualquiera podría leerlo.
> Lo que protege tus datos son las políticas RLS atadas a tu usuario.

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

**Si importas el repo desde GitHub** (lo más cómodo): en Vercel, *Add New → Project* →
elige el repo. *Framework Preset*: **Vite**. En *Environment Variables* añade las dos del
paso 2, y **borra cualquier fila de `ANTHROPIC_API_KEY`**: ahí no sirve para nada, y con
prefijo `VITE_` quedaría expuesta en el JavaScript público. Dale a **Deploy**.

**O desde la terminal**, en este orden:

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

## 4. Crear tu usuario

No hay registro público: te creas el usuario a mano una vez, y así nadie más puede entrar.

En Supabase → **Authentication → Users** → **Add user** → *Create new user*:

- **Email**: el tuyo
- **Password**: la que quieras, guárdala en tu gestor de contraseñas
- Marca **Auto Confirm User** (si no, el usuario queda sin confirmar y no podrás entrar)

Y desactiva el registro público, para que nadie más pueda crearse una cuenta:

> **Authentication → Sign In / Providers → Email** → desactiva *Allow new users to sign up*

## 5. Entrar y cargar tus contenidos

1. Abre tu URL, escribe correo y contraseña, **Entrar**.
2. La sesión se guarda: no tendrás que repetirlo en ese dispositivo. Para salir, el
   enlace *salir* junto al nombre en la cabecera.
3. **Contenido → Elegir archivo** y sube tus `.md`.
4. Repite el acceso en el móvil con el mismo correo y contraseña: verás lo mismo.

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

**«Correo o contraseña incorrectos»** — revisa el correo. Si estás segura de la
contraseña, cámbiala en Authentication → Users → tu usuario → *Reset password*.

**«Ese usuario está sin confirmar»** — se te olvidó marcar *Auto Confirm User* al
crearlo. Edítalo en Authentication → Users y confírmalo.

**Quiero llevarme mis datos** — **Contenido → Exportar copia de seguridad** baja un JSON
con todos tus temas y preguntas. El progreso vive en Supabase; puedes verlo y exportarlo
desde su **Table Editor**.
