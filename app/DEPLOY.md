# Desplegar en el SWAS de Alibaba Cloud

## 1 · La VM

Consola de Alibaba Cloud → Simple Application Server → crear instancia:
- Imagen: **Ubuntu 22.04**
- Plan sugerido: **2 vCPU / 2 GB RAM** como mínimo (3 contenedores + Chromium para el PDF).
  Si el pago o el login llegan a fallar por falta de memoria, sube al de 2 vCPU / 4 GB.
- Anota la IP pública y la contraseña/llave SSH que te den.

## 2 · Instalar Docker

Por SSH a la VM:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # cierra sesión y vuelve a entrar para que aplique
```

## 3 · Traer el código

```bash
git clone <url-del-repo> auriscan
cd auriscan/app
cp .env.example .env
nano .env   # llena TODAS las variables -- ver la lista abajo
```

## 4 · Las 4 cosas que hay que crear antes de llenar el `.env`

1. **Clerk** — [clerk.com](https://clerk.com) → crear app → en Configure → SSO Connections activa
   **Google** y desactiva cualquier otro método (email/contraseña, etc.) → copia la
   `Publishable key` y la `Secret key`.
2. **Wompi** — [comercios.wompi.co](https://comercios.wompi.co) (o usa las llaves de sandbox de
   [wompi.co/en/docs](https://docs.wompi.co) para probar sin cuenta real) → copia la llave
   pública, la privada y el secreto de integridad. El secreto de eventos sale de
   Configuración → Eventos, al activar el webhook.
3. **OSS** *(opcional mientras se está probando)* — con `STORAGE_DRIVER=local` (el valor por
   defecto) las fotos y PDFs se guardan en un volumen de Docker, sin necesitar bucket. Cuando
   se vaya a producción de verdad: consola de Alibaba Cloud → Object Storage Service → crear
   bucket (región `us-east-1` para que quede cerca del resto) → RAM → crea un usuario con
   AccessKey y la política `AliyunOSSFullAccess` acotada a ese bucket → pon `STORAGE_DRIVER=oss`
   + las `OSS_*` en el `.env`.
4. **APP_ORIGIN** — la URL final donde va a vivir la app (ej. `https://auriscan.tudominio.com`
   si le pones dominio y HTTPS con Certbot/Caddy delante, o `http://<ip-de-la-vm>` mientras
   tanto). Wompi redirige ahí después del pago -- tiene que ser accesible desde afuera.

## 5 · Levantar todo

```bash
docker compose up -d --build
docker compose logs -f   # confirma que los 4 contenedores arrancan sin error
```

La base se crea sola la primera vez (aplica `db/schema.sql`). El sitio queda en el puerto 80.

## 6 · Quién ve el panel de métricas (`/admin`)

Se controla con `ADMIN_EMAILS` en el `.env` (correos separados por coma) -- ese es el que
manda, no algo que se pueda cambiar desde el navegador. Para agregar a la doctora más
adelante: súmala a esa variable y reinicia el backend (`docker compose up -d backend`).
También entra cualquiera con `rol='admin'` en la tabla `usuarios`, por si alguna vez hace
falta dar acceso sin redeploy:

```bash
docker compose exec postgres psql -U auriscan -d auriscan \
  -c "update usuarios set rol='admin' where email='correo-de-la-doctora@gmail.com';"
```

## 7 · Verificar de punta a punta

1. Entra a la URL, inicia sesión con Google.
2. Sube una foto de prueba, analiza -- debe verse el resumen (no el informe completo).
3. Dale a "Pagar y descargar PDF" -- si `WOMPI_ENV=test`, usa las tarjetas de prueba de
   [la documentación de Wompi](https://docs.wompi.co/docs/en/tarjetas-de-prueba) para aprobar
   el pago sin plata real.
4. Confirma que el PDF se descarga solo. Revisa `/api/admin-metricas` con la cuenta admin.

## Notas

- HTTPS no viene incluido -- si vas a cobrar de verdad, pon un proxy con Caddy o Nginx +
  Certbot delante del puerto 80, o usa el balanceador/CDN de Alibaba. Sin HTTPS, Google y
  Wompi igual pueden bloquear el flujo en producción.
- El respaldo diario sube a `respaldos/auriscan-<fecha>.dump` en el mismo bucket de OSS.
  Restaurar: `pg_restore --dbname=$DATABASE_URL archivo.dump`.
- Migrar la base a RDS más adelante: solo cambia `DATABASE_URL` a la del RDS y quita el
  servicio `postgres` del compose -- el resto del código no cambia.
