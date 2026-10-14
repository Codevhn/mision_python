#!/bin/sh
# Optional private egress for KoboldCpp; never replaces Atlas' public service.
set -eu
if [ "${ATLAS_TAILSCALE_ENABLED:-0}" = "1" ]; then
    export KOBOLDCPP_HTTP_PROXY=http://127.0.0.1:1056
    if [ -z "${TAILSCALE_AUTHKEY:-}" ]; then
        echo 'Atlas: falta TAILSCALE_AUTHKEY; el modelo local no está conectado.' >&2
    else
        umask 077
        state_dir=${ATLAS_TAILSCALE_STATE_DIR:-/data/tailscale}
        socket=${ATLAS_TAILSCALE_SOCKET:-/tmp/atlas-tailscale.sock}
        mkdir -p "$state_dir"
        chmod 700 "$state_dir"
        auth_file=$(mktemp /tmp/atlas-tailscale-auth.XXXXXX)
        trap 'rm -f "$auth_file"' EXIT HUP INT TERM
        printf '%s' "$TAILSCALE_AUTHKEY" > "$auth_file"
        unset TAILSCALE_AUTHKEY
        tailscaled --tun=userspace-networking --state="$state_dir/tailscaled.state" \
            --socket="$socket" --outbound-http-proxy-listen=127.0.0.1:1056 &
        daemon_pid=$!
        attempts=0
        while [ ! -S "$socket" ] && kill -0 "$daemon_pid" 2>/dev/null && [ "$attempts" -lt 10 ]; do
            sleep 1
            attempts=$((attempts + 1))
        done
        if [ -S "$socket" ] && timeout 35 tailscale --socket="$socket" up \
            --auth-key="file:$auth_file" --hostname="atlas-fly-${FLY_MACHINE_ID:-local}" \
            --advertise-tags="${TAILSCALE_TAGS:-tag:atlas}" --accept-dns=false \
            --accept-routes=false --shields-up --timeout=30s >/dev/null 2>&1; then
            echo 'Atlas: enlace Tailscale activo para KoboldCpp.' >&2
        else
            echo 'Atlas: Tailscale no está listo. Revisa la clave, las etiquetas y el acceso; Atlas seguirá disponible.' >&2
        fi
        rm -f "$auth_file"
        trap - EXIT HUP INT TERM
    fi
fi
unset TAILSCALE_AUTHKEY
exec "$@"
