"""Readable Unicode for simple LaTeX math; preserve unsupported math and code."""
import re

SYMBOLS = {"subseteq": "⊆", "subset": "⊂", "supseteq": "⊇", "times": "×",
           "cdot": "·", "dots": "…", "ldots": "…", "in": "∈", "notin": "∉",
           "leq": "≤", "geq": "≥", "neq": "≠", "to": "→", "infty": "∞"}
SUB = dict(zip("0123456789+-=()aehijklmnoprstuvx", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ"))
SUP = dict(zip("0123456789+-=()in", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ"))


def readable_math(markdown):
    def convert(match):
        raw = match[0]
        if raw.startswith('`'):
            return raw
        body = raw[2:-2].strip()
        body = re.sub(r"\\([a-zA-Z]+)", lambda m: SYMBOLS.get(m[1], m[0]), body)
        def index(m):
            alphabet = SUB if m[1] == '_' else SUP
            value = m[2] or m[3]
            return ''.join(alphabet[c] for c in value) if all(c in alphabet for c in value) else m[0]
        body = re.sub(r"([_^])(?:\{([^{}]+)\}|([a-zA-Z0-9]))", index, body)
        if re.search(r"[\\_^{}]", body):
            return raw
        return re.sub(r"\s+", " ", body)
    pattern = r"`+[^`\n]*`+|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$"
    result, prose, fence = [], [], None
    def flush():
        result.append(re.sub(pattern, convert, ''.join(prose)))
        prose.clear()
    for line in markdown.splitlines(keepends=True):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if marker:
            flush()
            if fence is None:
                fence = marker[1]
            elif marker[1][0] == fence[0] and len(marker[1]) >= len(fence):
                fence = None
            result.append(line)
        elif fence or line.startswith(('    ', '\t')):
            flush(); result.append(line)
        else:
            prose.append(line)
    flush()
    return ''.join(result)
