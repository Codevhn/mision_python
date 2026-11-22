import json

import pytest

from lesson_quality import review_lesson


CONTEXT = {'title': 'Resolver problemas', 'lesson_objective': 'Aplicar un método.',
           'lesson_guidance': 'Usar un caso sencillo.', 'lesson_outline': [
               {'level': 2, 'title': 'Descomponer'}, {'level': 2, 'title': 'Depurar'}]}
DRAFT = '## Descomponer\n\nPrimer desarrollo.\n\n## Depurar\n\nSegundo desarrollo.'


def test_review_receives_current_guide_and_uses_selected_provider():
    def call(system, prompt, **options):
        payload = json.loads(prompt.split('\n')[-1])
        assert payload['context']['lesson_objective'] == CONTEXT['lesson_objective']
        assert payload['context']['lesson_guidance'] == CONTEXT['lesson_guidance']
        assert options['provider'] == 'chosen-provider'
        assert options['model'] == 'chosen-model'
        assert options['fail_on_truncation']
        return DRAFT.replace('Primer desarrollo.', 'Caso compartido: promedio de notas.'), None
    assert 'Caso compartido' in review_lesson(call, 'System', DRAFT, CONTEXT, 'Desarrollar', 'chosen-provider', 'chosen-model')


@pytest.mark.parametrize('answer', ['', 'Texto sin encabezados.',
    '## Descomponer\n\nSolo un tema.',
    '## Depurar\n\nSegundo.\n\n## Descomponer\n\nPrimero.',
    '## Descomponer\n\n## Depurar\n\nSin desarrollar el primero.',
    '```markdown\n' + DRAFT + '\n```'])
def test_review_rejects_empty_incomplete_or_reordered_results(answer):
    with pytest.raises(ValueError):
        review_lesson(lambda *args, **kwargs: (answer, None), '', DRAFT, CONTEXT, '', 'p', 'm')


def test_code_fences_do_not_add_fake_sections():
    answer = DRAFT.replace('Primer desarrollo.', '```python\n## No es un tema\nprint(1)\n```')
    assert review_lesson(lambda *args, **kwargs: (answer, None), '', DRAFT, CONTEXT, '', 'p', 'm') == answer


def test_heading_identity_preserves_csharp_and_unicode():
    context = {'lesson_outline': [{'level': 2, 'title': 'C#'}, {'level': 2, 'title': 'Depuración'}]}
    answer = '## C\\#\n\nPrimer tema.\n\n## Depuracio\u0301n ##\n\nSegundo tema.'
    assert review_lesson(lambda *args, **kwargs: (answer, None), '', answer, context, '', 'p', 'm') == answer
