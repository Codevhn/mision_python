"""Bounded, measured PDF layout; never crop or discard document content."""
import math

DEFAULT_FONT_SIZE = 10.5
MIN_FONT_SIZE = 9.0
MAX_FONT_SIZE = 14.0


class OnePageUnavailable(ValueError):
    def __init__(self, page_count):
        self.page_count = page_count
        super().__init__('El contenido no cabe en una hoja A4 manteniendo un texto de al menos 9 pt. '
                         'No se ha recortado nada. Elige «Paginación normal» para exportarlo completo.')


def validate_layout(mode, font_size, fmt):
    if not isinstance(mode, str) or mode not in ('normal', 'one_page'):
        raise ValueError('Distribución de PDF no válida')
    if type(font_size) not in (int, float) or not math.isfinite(font_size) or not MIN_FONT_SIZE <= font_size <= MAX_FONT_SIZE:
        raise ValueError('El tamaño de texto debe estar entre 9 y 14 pt')
    if mode == 'one_page' and fmt != 'pdf':
        raise ValueError('Ajustar a una hoja requiere el formato PDF')


def layout_css(font_size=DEFAULT_FONT_SIZE, compact=False):
    if font_size == DEFAULT_FONT_SIZE and not compact:
        return ''  # Preserve the normal template's existing typography.
    scale = font_size / DEFAULT_FONT_SIZE
    title = max(17, 26 * scale) if compact else 26 * scale
    css = f'''
body {{ font-size:{font_size:g}pt; }}
.pdf-cover-title {{ font-size:{title:g}pt; }}
h1 {{ font-size:{20*scale:g}pt; }}
h2 {{ font-size:{15*scale:g}pt; }}
h3 {{ font-size:{12.5*scale:g}pt; }}
h4 {{ font-size:{11*scale:g}pt; }}
h5 {{ font-size:{9.5*scale:g}pt; }}
table {{ font-size:{max(8,9.2*scale):g}pt; }}
th {{ font-size:{max(8,9*scale):g}pt; }}
pre {{ font-size:{max(7.5,8.3*scale):g}pt; }}
.alert, .note {{ font-size:{max(8.5,9.8*scale):g}pt; }}
'''
    if compact:
        css += '''
@page { size:A4; margin:14mm; }
body { line-height:1.35; }
.pdf-cover { padding-bottom:8px; margin-bottom:12px; }
.pdf-cover-title { line-height:1.15; }
h1,h2,h3,h4,h5 { margin-top:.65em; margin-bottom:.35em; line-height:1.2; }
h2 { padding-bottom:3px; }
p { margin-bottom:.4em; orphans:2; widows:2; }
ul,ol { margin-top:.2em; margin-bottom:.5em; }
li { margin-top:2px; margin-bottom:2px; line-height:1.35; }
li > ul, li > ol { margin-top:2px; margin-bottom:2px; }
table { margin-top:.6em; margin-bottom:.6em; }
th,td { padding:4px 7px; }
blockquote,.alert,.note { margin-top:.6em; margin-bottom:.6em; padding:5px 10px; }
pre { padding:8px 10px; margin-top:.6em; margin-bottom:.6em; line-height:1.3; }
hr { margin-top:.7em; margin-bottom:.7em; }
'''
    # WeasyPrint treats supplied stylesheets as user-origin CSS. Important
    # declarations are needed to override the document template's author CSS.
    return css.replace(';', ' !important;')


def render_pdf_layout(html, mode='normal', font_size=DEFAULT_FONT_SIZE):
    """Return the actual laid-out Document to serialize, not a page-count guess.

    At most six layouts; large documents fail before repeated compact layouts.
    The same HTML/fetcher owns every attempt, so fonts and resources stay local
    to the export's existing resource policy.
    """
    from weasyprint import CSS
    def render(size, compact):
        css = layout_css(size, compact)
        return html.render(stylesheets=[CSS(string=css)] if css else [])
    document = render(font_size, False)
    if mode == 'normal' or len(document.pages) == 1:
        return dict(document=document, pages=len(document.pages), font_size=font_size, compact=False)
    initial_pages = len(document.pages)
    if initial_pages > 4:
        raise OnePageUnavailable(initial_pages)
    candidates = sorted({float(font_size), min(font_size,10.5), min(font_size,10), min(font_size,9.5), MIN_FONT_SIZE}, reverse=True)
    for size in candidates:
        document = render(size, True)
        if len(document.pages) == 1:
            return dict(document=document, pages=1, font_size=size, compact=True)
    raise OnePageUnavailable(initial_pages)
