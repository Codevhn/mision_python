"""Explicit structural profiles. No private inventory values belong in source."""
BOOKS_PROFILE = 'books-drive-inventory-v1'
BOOK_COLUMNS = (
    ('drive_id', 'ID de Drive', 'text'),
    ('titulo_desde_nombre', 'Título provisional · nombre de archivo', 'text'),
    ('autoria_desde_nombre', 'Autoría provisional · nombre de archivo', 'text'),
    ('autores_verificados', 'Autores verificados', 'multi_select'),
    ('nombre_original', 'Nombre original del archivo', 'text'),
    ('formato', 'Formato', 'select'),
    ('mime_type', 'Tipo MIME', 'text'),
    ('tamano_bytes', 'Tamaño en bytes', 'number'),
    ('enlace_drive', 'Enlace de Drive', 'url'),
    ('carpeta', 'Carpeta de origen', 'text'),
    ('fecha_creacion_drive', 'Creación en Drive', 'date'),
    ('fecha_modificacion_drive', 'Modificación en Drive', 'date'),
    ('grupo_candidato', 'Grupo candidato · no confirmado', 'text'),
    ('fuente_metadatos', 'Fuente de metadatos', 'text'),
    ('verificacion', 'Verificación bibliográfica', 'select'),
    ('subtitulo', 'Subtítulo', 'text'),
    ('titulo_original', 'Título original verificado', 'text'),
    ('traductor', 'Traductor', 'text'),
    ('ilustrador', 'Ilustrador', 'text'),
    ('editorial', 'Editorial', 'text'),
    ('anio', 'Año', 'number'),
    ('edicion', 'Edición', 'text'),
    ('isbn', 'ISBN', 'text'),
    ('genero', 'Género', 'text'),
    ('subgenero', 'Subgénero', 'text'),
    ('tematicas', 'Temáticas', 'multi_select'),
    ('etiquetas', 'Etiquetas', 'multi_select'),
    ('idioma', 'Idioma', 'text'),
    ('tipo_contenido', 'Tipo de contenido', 'text'),
    ('sinopsis', 'Sinopsis', 'text'),
    ('indice', 'Índice', 'text'),
    ('nivel', 'Nivel', 'text'),
    ('conocimientos_previos', 'Conocimientos previos', 'text'),
    ('paginas', 'Páginas', 'number'),
    ('saga', 'Saga', 'text'),
    ('volumen', 'Volumen', 'text'),
    # Unknown source values must stay unknown, not become False checkboxes.
    ('pdf_escaneado', 'PDF escaneado · sin confirmar', 'text'),
    ('ocr_disponible', 'OCR disponible · sin confirmar', 'text'),
    ('estado_lectura', 'Estado de lectura', 'status'),
    ('progreso', 'Progreso de lectura', 'number'),
    ('fecha_inicio', 'Inicio de lectura', 'date'),
    ('fecha_fin', 'Fin de lectura', 'date'),
    ('prioridad', 'Prioridad', 'text'),
    ('valoracion', 'Valoración personal', 'number'),
    ('notas', 'Notas personales', 'text'),
    ('fecha_revision', 'Fecha de revisión', 'date'),
)


def inventory_profile(data):
    if not isinstance(data, dict) or not {'archivos', 'grupos_candidatos', 'metadatos_drive_originales'} <= data.keys():
        return None
    if str(data.get('version')) != '1.0':
        raise ValueError('Versión del inventario de libros no compatible; revisar explícitamente su estructura')
    if any(not isinstance(data[k], list) for k in ('archivos', 'grupos_candidatos', 'metadatos_drive_originales')):
        raise ValueError('El inventario requiere archivos, grupos_candidatos y metadatos_drive_originales como listas')
    rows = data['archivos']
    required = {'drive_id', 'titulo_desde_nombre', 'enlace_drive'}
    if not rows or any(not isinstance(row, dict) or not required <= row.keys() for row in rows):
        raise ValueError('Cada archivo debe conservar drive_id, titulo_desde_nombre y enlace_drive')
    keys = set().union(*(row.keys() for row in rows))
    known = {key for key, _, _ in BOOK_COLUMNS}
    return dict(
        id=BOOKS_PROFILE,
        description='Inventario de libros: sólo archivos; grupos provisionales y metadatos originales se conservan como contexto privado, no como libros adicionales.',
        collection='/archivos', title_field='/titulo_desde_nombre', identity_field='/drive_id',
        name='Inventario de libros',
        columns=[dict(field='/'+key, name=label, type=kind) for key, label, kind in BOOK_COLUMNS if key in keys],
        context_counts=dict(candidate_groups=len(data['grupos_candidatos']), original_drive_metadata=len(data['metadatos_drive_originales'])),
        unknown_fields=sorted(keys-known),
        warning='El título y la autoría desde el nombre son provisionales. No se confirman autores ni se fusionan grupos. Los valores desconocidos permanecen vacíos.',
    )
