import json

import pytest

from lesson_examples import calculate, review_examples, Unsupported


def test_numeric_cases_expose_missing_preconditions_and_duplicate_minimum():
    expression = '(sum(values)-min(values))/(len(values)-1)'
    assert calculate(expression, {'values': [6, 8, 10]}) == 9
    assert calculate(expression, {'values': [1, 1, 3]}) == 2
    with pytest.raises(ZeroDivisionError): calculate(expression, {'values': [6]})
    with pytest.raises(ValueError): calculate(expression, {'values': []})


@pytest.mark.parametrize('expression', ["__import__('os').system('id')", 'values.remove(1)', '[x for x in values]', '2**10000000', '[1]*10000000', 'open(1)', '(lambda: 1)()'])
def test_untrusted_code_and_unbounded_operations_are_not_executed(expression):
    with pytest.raises(Unsupported): calculate(expression, {'values': [1]})


def test_example_report_distinguishes_calculated_failed_and_unsupported():
    draft = 'Calcular promedio descartando una sola nota mínima.'
    answer = {'examples': [{'quote': draft, 'assessment': 'Se necesitan al menos dos notas.', 'cases': [
        {'expression': '(sum(values)-min(values))/(len(values)-1)', 'inputs': {'values': [6, 8, 10]}, 'expected': 9},
        {'expression': '1/0', 'inputs': {}, 'expected': 9},
        {'expression': 'values.remove(1)', 'inputs': {'values': [1, 1, 3]}, 'expected': 2},
    ]}]}
    report = review_examples(lambda *a, **k: (json.dumps(answer), None), draft, 'p', 'm')
    cases = report['examples'][0]['cases']
    assert [case['status'] for case in cases] == ['passed', 'failed', 'not_checked']
    assert cases[1]['actual_error'] == 'ZeroDivisionError'


def test_report_requires_examples_to_be_anchored_to_the_draft():
    answer = {'examples': [{'quote': 'Inventado', 'assessment': '', 'cases': []}]}
    with pytest.raises(ValueError): review_examples(lambda *a, **k: (json.dumps(answer), None), 'Otro texto', 'p', 'm')


def test_non_finite_inputs_cannot_be_persisted_as_invalid_json():
    answer = {'examples': [{'quote': 'Ejemplo', 'assessment': 'Caso', 'cases': [
        {'expression': 'x', 'inputs': {'x': float('nan')}, 'expected': 1}]}]}
    with pytest.raises(ValueError): review_examples(lambda *a, **k: (json.dumps(answer), None), 'Ejemplo', 'p', 'm')
