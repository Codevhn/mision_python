# CRON — Planificador de tareas en Linux

## ¿Qué es cron?

`cron` es el servicio de Linux encargado de ejecutar tareas automáticamente en horarios definidos.

Permite automatizar:

* backups
* limpieza de archivos
* monitoreo
* ejecución de scripts
* tareas repetitivas del sistema

## Concepto importante

Un script puede funcionar manualmente pero fallar en `cron`.

### ¿Por qué?

Porque `cron` ejecuta scripts en un entorno distinto al de tu terminal interactiva.

## Diferencias importantes entre terminal normal y cron

En terminal:

* tienes variables de entorno cargadas
* tienes aliases
* tienes tu PATH completo
* estás ubicado en un directorio específico
* tienes sesión interactiva

En cron:

* el PATH puede ser mínimo
* el directorio actual puede ser distinto
* no carga aliases
* no carga configuraciones de shell
* algunas variables de entorno no existen

## Ejemplo básico

```bash
0 2 * * * python /home/codev/scripts/backup.py
```

Significa: ejecutar `backup.py` todos los días a las 2:00 AM.

## Lección de ingeniería

El software no depende solo del código. También depende de:

* entorno
* variables
* permisos
* rutas
* servicios
* dependencias
* contexto de ejecución

## Idea clave

Un ingeniero fuerte no solo depura código. También depura:

* sistemas
* entorno
* procesos
* permisos
* automatizaciones
* comportamiento del sistema operativo
