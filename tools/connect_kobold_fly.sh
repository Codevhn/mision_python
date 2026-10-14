#!/usr/bin/env bash
# Run on the user's PC after Tailscale and its access policy are ready.
set -euo pipefail
command -v fly >/dev/null || { echo 'Instala/inicia sesión en flyctl antes de continuar.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Se necesita Python 3 para validar la dirección.' >&2; exit 1; }
read -r -p 'IP privada de tu PC (tailscale ip -4): ' atlas_pc_ip
python3 - "$atlas_pc_ip" <<'PY'
import ipaddress, sys
try:
    ip = ipaddress.ip_address(sys.argv[1])
    assert ip in ipaddress.ip_network('100.64.0.0/10')
except (ValueError, AssertionError):
    sys.exit('Introduce la IP IPv4 privada que devuelve tailscale ip -4.')
PY
read -r -p 'Puerto de KoboldCpp [5001]: ' atlas_pc_port
atlas_pc_port=${atlas_pc_port:-5001}
python3 - "$atlas_pc_port" <<'PY'
import sys
try:
    assert sys.argv[1].isdigit() and 1 <= int(sys.argv[1]) <= 65535
except AssertionError:
    sys.exit('Puerto inválido.')
PY
read -rs -p 'Clave de Tailscale para tag:atlas (entrada oculta): ' atlas_ts_key
printf '\n'
[[ -n "$atlas_ts_key" ]] || { echo 'No se introdujo una clave.' >&2; exit 1; }
printf '%s\n' 'ATLAS_TAILSCALE_ENABLED=1' \
    "KOBOLDCPP_BASE_URL=http://${atlas_pc_ip}:${atlas_pc_port}/v1" \
    'KOBOLDCPP_MAX_OUTPUT_TOKENS=1024' "TAILSCALE_AUTHKEY=$atlas_ts_key" \
    | fly secrets import --stage -a mision-pythonhn
unset atlas_ts_key
echo 'Secretos preparados para el próximo despliegue. Ejecuta: fly deploy -a mision-pythonhn'
