"""Bounded public HTTP(S) retrieval for user-requested export media only.

No cookies/proxy environment/auth headers. Validate every redirect and pin the
socket to the validated IP while keeping the original Host and TLS server name.
"""
from concurrent.futures import ThreadPoolExecutor, TimeoutError as ResolveTimeout
import http.client
import ipaddress
import socket
import ssl
import threading
import time
from urllib.parse import urlsplit, urljoin, quote

_RESOLVER = ThreadPoolExecutor(max_workers=2, thread_name_prefix='atlas-export-dns')


class RemoteAssetError(ValueError):
    pass


def public_addresses(host, port, timeout):
    future = _RESOLVER.submit(socket.getaddrinfo, host, port, 0, socket.SOCK_STREAM)
    try:
        answers = future.result(timeout=max(.01, timeout))
    except (OSError, ResolveTimeout) as error:
        future.cancel()
        raise RemoteAssetError('remote_dns_unavailable') from error
    addresses = []
    for family, _, _, _, address in answers:
        if family not in (socket.AF_INET, socket.AF_INET6): continue
        ip = ipaddress.ip_address(address[0])
        if not ip.is_global or ip.is_multicast or (ip.version == 6 and ip.ipv4_mapped and not ip.ipv4_mapped.is_global):
            raise RemoteAssetError('remote_private_address_blocked')
        addresses.append(str(ip))
    if not addresses: raise RemoteAssetError('remote_dns_unavailable')
    return sorted(set(addresses), key=lambda ip: ipaddress.ip_address(ip).version)


def fetch_remote_asset(url, limit, timeout=5):
    deadline = time.monotonic() + timeout
    try: initial_scheme = urlsplit(url).scheme.lower()
    except ValueError as error: raise RemoteAssetError('remote_url_invalid') from error
    for hop in range(4):
        conn = None; sockets = []; timer = None
        def remaining():
            left = deadline-time.monotonic()
            if left <= 0: raise RemoteAssetError('remote_timeout')
            return left
        def abort():
            for sock in sockets:
                try: sock.shutdown(socket.SHUT_RDWR)
                except OSError: pass
                try: sock.close()
                except OSError: pass
        try:
            if any(ord(c) < 33 for c in url) or '\\' in url: raise RemoteAssetError('remote_url_invalid')
            parsed = urlsplit(url); scheme = parsed.scheme.lower()
            if scheme not in ('http', 'https') or not parsed.hostname or parsed.username is not None or parsed.password is not None:
                raise RemoteAssetError('remote_url_invalid')
            port = parsed.port or (443 if scheme == 'https' else 80)
            if port != (443 if scheme == 'https' else 80): raise RemoteAssetError('remote_port_blocked')
            if initial_scheme == 'https' and scheme != 'https': raise RemoteAssetError('remote_tls_downgrade_blocked')
            host = parsed.hostname.encode('idna').decode('ascii')
            if '%' in host: raise RemoteAssetError('remote_url_invalid')
            addresses = public_addresses(host, port, remaining())
            # Never resolve the name again between validation and connect.
            raw = socket.create_connection((addresses[0], port), timeout=remaining()); sockets.append(raw)
            timer = threading.Timer(remaining(), abort); timer.daemon = True; timer.start()
            if scheme == 'https':
                context = ssl.create_default_context()
                sock = context.wrap_socket(raw, server_hostname=host); sockets.append(sock)
                conn = http.client.HTTPSConnection(host, port, timeout=remaining(), context=context)
            else:
                sock = raw; conn = http.client.HTTPConnection(host, port, timeout=remaining())
            sock.settimeout(remaining()); conn.sock = sock
            target=quote(parsed.path or '/',safe="/%:@!$&'()*+,;=-._~")+('?' + quote(parsed.query,safe="%=&;+?:/@!$'()*,-._~[]") if parsed.query else '')
            conn.request('GET', target,
                         headers={'User-Agent':'Atlas-Record-Export/1.0', 'Accept-Encoding':'identity', 'Accept':'*/*'})
            response = conn.getresponse()
            if response.status in (301,302,303,307,308):
                location = response.getheader('Location')
                if not location or hop == 3: raise RemoteAssetError('remote_redirect_limit')
                url = urljoin(url, location)
                continue
            if response.status != 200: raise RemoteAssetError('remote_http_' + str(response.status))
            if response.getheader('Content-Encoding', 'identity').lower() not in ('identity',''):
                raise RemoteAssetError('remote_encoding_unsupported')
            length = response.getheader('Content-Length')
            if length is not None and int(length) > limit: raise RemoteAssetError('remote_asset_too_large')
            body = bytearray()
            while True:
                sock.settimeout(remaining())
                chunk = response.read1(min(64*1024, limit-len(body)+1))
                if not chunk: break
                body.extend(chunk)
                if len(body) > limit: raise RemoteAssetError('remote_asset_too_large')
            return bytes(body), response.getheader('Content-Type', 'application/octet-stream').split(';',1)[0], url
        except RemoteAssetError:
            raise
        except (OSError, ValueError, http.client.HTTPException, UnicodeError) as error:
            reason = 'remote_timeout' if time.monotonic() >= deadline else 'remote_fetch_failed'
            raise RemoteAssetError(reason) from error
        finally:
            if timer: timer.cancel()
            if conn: conn.close()
            for sock in sockets:
                try: sock.close()
                except OSError: pass
    raise RemoteAssetError('remote_redirect_limit')
