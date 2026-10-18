import base64
import io
import json

import pytest
from PIL import Image

import app as application
from cover_storage import compare, cover_path, inventory, preserve


def png():
    output = io.BytesIO()
    Image.new('RGB', (2, 2), 'blue').save(output, 'PNG')
    return output.getvalue()


def test_uploaded_cover_keeps_url_and_bytes_in_data_volume(auth_client):
    raw = png()
    response = auth_client.post('/api/upload/cover', json={
        'dataUrl': 'data:image/png;base64,' + base64.b64encode(raw).decode()})
    assert response.status_code == 200
    url = response.json['url']
    assert url.startswith('/static/covers/')
    assert (application.DATA_DIR / 'covers' / url.rsplit('/', 1)[1]).read_bytes() == raw
    fetched = auth_client.get(url)
    assert fetched.status_code == 200 and fetched.data == raw
    assert fetched.headers['Content-Type'].startswith('image/png')


def test_persistent_precedence_legacy_compatibility_and_traversal(tmp_path):
    data, legacy = tmp_path / 'data', tmp_path / 'legacy'
    legacy.mkdir(); (legacy / 'a.png').write_bytes(b'legacy')
    assert cover_path(data, legacy, 'a.png') == legacy / 'a.png'
    (data / 'covers').mkdir(parents=True); (data / 'covers/a.png').write_bytes(png())
    assert cover_path(data, legacy, 'a.png') == data / 'covers/a.png'
    with pytest.raises(ValueError):
        cover_path(data, legacy, '../../private.txt')


def test_preservation_repeat_conflict_and_historical_damage(tmp_path):
    source, target = tmp_path / 'legacy', tmp_path / 'persistent'
    source.mkdir(); (source / 'good.png').write_bytes(png())
    (source / 'old-broken.png').write_bytes(b'broken before release')
    original = inventory(source)
    assert preserve(source, target)['copied'] == 2
    assert preserve(source, target)['copied'] == 0
    assert inventory(target) == original
    result = compare(original, inventory(target))
    assert result['historical_invalid_unchanged'] == ['old-broken.png']
    assert not result['missing'] and not result['new_or_changed_invalid']
    (target / 'old-broken.png').write_bytes(b'different damage')
    result = compare(original, inventory(target))
    assert result['new_or_changed_invalid'] == ['old-broken.png']
    with pytest.raises(ValueError, match='no se sobrescribe'):
        preserve(source, target)
    assert (target / 'old-broken.png').read_bytes() == b'different damage'
    assert inventory(source) == original
    (target / 'good.png').unlink()
    assert compare(original, inventory(target))['missing'] == ['good.png']


def test_preservation_rejects_links(tmp_path):
    source = tmp_path / 'legacy'; source.mkdir()
    (source / 'link').symlink_to(tmp_path / 'outside')
    with pytest.raises(ValueError, match='enlaces'):
        preserve(source, tmp_path / 'target')
