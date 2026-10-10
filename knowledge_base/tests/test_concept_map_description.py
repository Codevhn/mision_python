"""Saved explanations must survive graph edits and remain scoped to their node."""

def test_saved_explanation_survives_graph_changes(auth_client):
    cmap = auth_client.post('/api/concept-maps', json={'title': 'CSS'}).json
    url = '/api/concept-maps/' + cmap['id']
    cmap = auth_client.post(url + '/nodes', json={'text': 'margin-left', 'x': 10, 'y': 20}).json
    node_id = cmap['nodes'][0]['id']
    node_url = url + '/nodes/' + node_id
    description = 'Margen exterior izquierdo.\n\nPuede ser negativo.'
    assert auth_client.patch(node_url, json={'description': description}).status_code == 200
    auth_client.patch(node_url, json={'text': 'Margen izquierdo', 'x': 80})
    saved = auth_client.get(url).json['nodes'][0]
    assert saved['description'] == description
    assert saved['text'] == 'Margen izquierdo'
    assert saved['x'] == 80
    assert auth_client.patch(node_url, json={'description': {'bad': 'format'}}).status_code == 400
    assert auth_client.get(url).json['nodes'][0]['description'] == description
    auth_client.patch(node_url, json={'description': ''})
    assert auth_client.get(url).json['nodes'][0]['description'] == ''


def test_explanation_size_is_bounded(auth_client):
    cmap = auth_client.post('/api/concept-maps', json={'title': 'Bounded'}).json
    url = '/api/concept-maps/' + cmap['id']
    cmap = auth_client.post(url + '/nodes', json={'text': 'Concept'}).json
    node_url = url + '/nodes/' + cmap['nodes'][0]['id']
    assert auth_client.patch(node_url, json={'description': 'x' * 12001}).status_code == 200
    assert len(auth_client.get(url).json['nodes'][0]['description']) == 12000
