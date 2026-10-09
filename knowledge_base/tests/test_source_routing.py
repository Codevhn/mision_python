import json
import pytest
from source_routing import route_sources
from documentation import focused_excerpt


def classify(technology,kind,canonical,section='general'):
    return lambda *a,**k:(json.dumps({'technology':technology,'kind':kind,'canonical':canonical,'section':section,'keywords':[canonical]}),None)


@pytest.mark.parametrize('term,tech,kind,canonical,fragment',[
 ('pathlib','python','module','pathlib','library/pathlib.html'),
 ('Funciones','python','function','function','library/functions.html'),
 ('git rebase','git','command','git rebase','docs/git-rebase'),
 ('SELECT','sqlite','command','select','lang_select.html'),
 ('CREATE TABLE','postgresql','command','create table','sql-createtable.html'),
 ('Clases','java','class','class','classes-objects'),
 ('Funciones','javascript','function','function','JavaScript/Guide/Functions'),
])
def test_routes_many_entities_without_individual_entry_rules(term,tech,kind,canonical,fragment):
    result=route_sources(classify(tech,kind,canonical),term,{},'provider','model')
    assert any(fragment in url for url in result['urls'])
    assert len(result['urls'])<=3


def test_unspecified_sql_dialect_does_not_choose_postgres():
    assert route_sources(classify('sql','concept','transaction'),'Transacciones SQL',{},'p','m')['urls']==[]


def test_bad_classifier_does_not_invent_external_urls():
    assert route_sources(lambda *a,**k:('not JSON',None),'Termino desconocido',{},'p','m')['urls']==[]
    assert route_sources(classify('python','module','../../internal'),'Termino',{},'p','m')['urls']==['https://docs.python.org/3/glossary.html']


def test_user_sources_override_catalog_and_empty_list_disables_fetch():
    assert route_sources(classify('python','module','venv'),'venv',{'reference_urls':[]},'p','m')['urls']==[]
    urls=['https://docs.python.org/3/library/venv.html']
    assert route_sources(classify('python','module','venv'),'venv',{'reference_urls':urls},'p','m')['urls']==urls


def test_excerpt_retrieves_late_topic_instead_of_only_page_start():
    text='Introduction to the language. '*800+'\nDecorators wrap a function and return a callable.\n'+'Other content. '*100
    selected=focused_excerpt(text,'decorators callable')
    assert 'Decorators wrap a function' in selected
    assert len(selected)<=12000
