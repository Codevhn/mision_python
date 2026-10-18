"""Persisted filter grammar shared by API validation and read-only exports."""
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def validate_filters(view):
    count = 0
    def visit(rules, depth=0):
        nonlocal count
        if not isinstance(rules, list) or depth > 8:
            raise ValueError('Filtros: máximo 8 niveles y 100 condiciones')
        for rule in rules:
            count += 1
            if not isinstance(rule, dict) or count > 100:
                raise ValueError('Filtros: máximo 8 niveles y 100 condiciones')
            if 'rules' in rule:
                if rule.get('mode') not in ('and', 'or'):
                    raise ValueError('Combinación de filtros no válida')
                visit(rule['rules'], depth + 1)
            if rule.get('timeZone'):
                checked_zone(rule['timeZone'])
    visit(view.get('filters', []))
    if view.get('filterTimeZone'):
        checked_zone(view['filterTimeZone'])


def checked_zone(value):
    try:
        return ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise ValueError('Zona horaria de filtros no válida') from None


def filter_today(zone='UTC', now=None):
    return (now or datetime.now(timezone.utc)).astimezone(checked_zone(zone)).date()


def relative_range(period, today):
    if isinstance(today, str):
        today = date.fromisoformat(today)
    day = lambda n: today + timedelta(days=n)
    if period in ('today', 'yesterday', 'tomorrow'):
        value = day({'today': 0, 'yesterday': -1, 'tomorrow': 1}[period])
        return value, value
    if period == 'past_7_days': return day(-6), today
    if period == 'next_7_days': return today, day(6)
    if period in ('this_week', 'last_week', 'next_week'):
        start = -today.weekday() + {'this_week': 0, 'last_week': -7, 'next_week': 7}[period]
        return day(start), day(start + 6)
    if period in ('this_month', 'last_month', 'next_month'):
        offset = {'this_month': 0, 'last_month': -1, 'next_month': 1}[period]
        month = today.year * 12 + today.month - 1 + offset
        start = date(month // 12, month % 12 + 1, 1)
        end = date((month + 1) // 12, (month + 1) % 12 + 1, 1) - timedelta(days=1)
        return start, end
    return None


def match_tree(rules, mode, matches):
    def leaves(items):
        return any(leaves(r['rules']) if 'rules' in r else True for r in items)
    active = [r for r in rules if 'rules' not in r or leaves(r['rules'])]
    if not active:
        return True
    test = lambda r: match_tree(r['rules'], r['mode'], matches) if 'rules' in r else matches(r)
    return any(map(test, active)) if mode == 'or' else all(map(test, active))
