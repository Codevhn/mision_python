"""Date values are legacy ISO strings or explicitly enabled start/end ranges."""
from datetime import datetime, date, timedelta
import re


def date_start(value):
    return value['start'] if isinstance(value, dict) and isinstance(value.get('start'), str) and isinstance(value.get('end'), str) else value


def checked_date(value):
    if isinstance(value, str):
        try: datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError: raise ValueError('Fecha ISO no válida') from None
        return value
    if not isinstance(value, dict) or set(value) != {'start', 'end'}:
        raise ValueError('Un rango requiere inicio y fin ISO')
    points = []
    for key in ('start', 'end'):
        raw = value[key]
        if not isinstance(raw, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T.*)?', raw):
            raise ValueError('El rango requiere fechas ISO completas')
        checked_date(raw)
        points.append(datetime.fromisoformat(raw.replace('Z', '+00:00')))
    if value['end'][:10] < value['start'][:10]:
        raise ValueError('El fin no puede ser anterior al inicio')
    if 'T' in value['start'] and 'T' in value['end']:
        if (points[0].tzinfo is None) != (points[1].tzinfo is None):
            raise ValueError('Ambas horas deben indicar zona, o ninguna')
        if points[1] < points[0]:
            raise ValueError('El fin no puede ser anterior al inicio')
    return dict(value)


def shift_date(value, target):
    """Shift latest endpoints by calendar days, retaining precision and zones."""
    start = date_start(value) or ''
    delta = (date.fromisoformat(target) - date.fromisoformat(start[:10])).days if start else 0
    if isinstance(value, dict):
        checked_date(value)
        return {key: (date.fromisoformat(raw[:10]) + timedelta(days=delta)).isoformat() + raw[10:]
                for key, raw in value.items()}
    return target + start[10:]
