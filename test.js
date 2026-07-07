/**
 * Test suite per il parser JSON → grafo
 * Esegui con: node test.js
 */

'use strict';

// ============================================================
// JSON Parser (copia della logica usata nell'app)
// ============================================================
function parseJSONToGraph(jsonObj) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();
  const linkSet = new Set();
  let idCounter = 0;

  function makeId() {
    return 'n' + (idCounter++);
  }

  function getOrCreateNode(label, type, path) {
    const key = path + '|' + type + '|' + label;
    if (nodeMap.has(key)) {
      return nodeMap.get(key);
    }
    const id = makeId();
    const node = { id, label, type, path };
    nodeMap.set(key, node);
    nodes.push(node);
    return node;
  }

  function addLink(sourceId, targetId) {
    const linkKey = sourceId + '->' + targetId;
    if (!linkSet.has(linkKey)) {
      linkSet.add(linkKey);
      links.push({ source: sourceId, target: targetId });
    }
  }

  function traverse(obj, parentNode, currentPath) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return;

    for (const [key, value] of Object.entries(obj)) {
      const keyPath = currentPath ? currentPath + '.' + key : key;

      const keyNode = getOrCreateNode(key, 'key', keyPath);

      if (parentNode) {
        addLink(parentNode.id, keyNode.id);
      }

      if (typeof value === 'string') {
        const valNode = getOrCreateNode(value, 'value', keyPath + ':val');
        addLink(keyNode.id, valNode.id);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        const valNode = getOrCreateNode(String(value), 'primitive', keyPath + ':val');
        addLink(keyNode.id, valNode.id);
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        traverse(value, keyNode, keyPath);
      } else if (Array.isArray(value)) {
        const arrNode = getOrCreateNode('[' + value.length + ']', 'key', keyPath + ':arr');
        addLink(keyNode.id, arrNode.id);
        value.forEach((item, idx) => {
          if (typeof item === 'string') {
            const itemNode = getOrCreateNode(item, 'value', keyPath + '[' + idx + ']');
            addLink(arrNode.id, itemNode.id);
          } else if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
            traverse(item, arrNode, keyPath + '[' + idx + ']');
          }
        });
      }
    }
  }

  traverse(jsonObj, null, '');
  return { nodes, links };
}

// ============================================================
// Test runner
// ============================================================
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + message);
  } else {
    failed++;
    console.error('  ✗ ' + message);
  }
}

function title(text) {
  console.log('\n' + text);
}

// ============================================================
// Tests
// ============================================================

title('Test 1: package.json con dipendenze');
{
  const pkg = {
    name: 'my-app',
    version: '1.0.0',
    dependencies: {
      vue: '^3.4.0',
      d3: '^7.0.0',
    },
    devDependencies: {
      vite: '^5.0.0',
    },
  };

  const { nodes, links } = parseJSONToGraph(pkg);

  // Dovremmo avere nodi per le chiavi di primo livello: name, version, dependencies, devDependencies
  const topLevelKeys = nodes.filter(n => n.type === 'key' && !n.path.includes('.'));
  assert(topLevelKeys.length >= 4, 'Ci sono almeno 4 chiavi di primo livello');

  // Valori stringa di primo livello: 'my-app', '1.0.0'
  const topLevelValues = nodes.filter(n => n.type === 'value' && n.path.includes('name') || n.path.includes('version'));
  assert(topLevelValues.length >= 2, 'Ci sono nodi valore per name e version');

  // Nodi per dipendenze: vue, d3, vite (come chiavi dentro dependencies/devDependencies)
  const depKeys = nodes.filter(n => n.type === 'key' && (n.path.includes('dependencies.') || n.path.includes('devDependencies.')));
  assert(depKeys.length === 3, 'Ci sono 3 chiavi di dipendenza (vue, d3, vite)');

  // Valori delle dipendenze: '^3.4.0', '^7.0.0', '^5.0.0'
  const depValues = nodes.filter(n => n.type === 'value' && (n.label.startsWith('^') || n.label.startsWith('~')));
  assert(depValues.length === 3, 'Ci sono 3 valori di versione');

  // Link: top-level keys → values; dependencies → sub-keys → values
  assert(links.length > 0, 'Ci sono link nel grafo');

  // Verifica che ogni link abbia source e target validi
  const allIds = new Set(nodes.map(n => n.id));
  for (const link of links) {
    assert(allIds.has(link.source), 'Link source ' + link.source + ' esiste nei nodi');
    assert(allIds.has(link.target), 'Link target ' + link.target + ' esiste nei nodi');
  }
}

title('Test 2: JSON vuoto');
{
  const { nodes, links } = parseJSONToGraph({});
  assert(nodes.length === 0, 'JSON vuoto produce 0 nodi');
  assert(links.length === 0, 'JSON vuoto produce 0 link');
}

title('Test 3: JSON con nesting profondo');
{
  const deep = {
    a: {
      b: {
        c: {
          d: 'foglia',
        },
      },
    },
  };

  const { nodes, links } = parseJSONToGraph(deep);

  // a → b → c → d → 'foglia'
  // chiavi: a, b, c, d → 4
  // valori: 'foglia' → 1
  const keyNodes = nodes.filter(n => n.type === 'key');
  const valueNodes = nodes.filter(n => n.type === 'value');

  assert(keyNodes.length === 4, '4 nodi chiave nel nesting profondo');
  assert(valueNodes.length === 1, '1 nodo valore (foglia)');
  assert(links.length === 4, '4 link (a→b, b→c, c→d, d→foglia)');
}

title('Test 4: JSON con valori primitivi (numeri, booleani)');
{
  const prim = {
    enabled: true,
    count: 42,
    name: 'test',
  };

  const { nodes, links } = parseJSONToGraph(prim);

  const primNodes = nodes.filter(n => n.type === 'primitive');
  assert(primNodes.length === 2, '2 nodi primitivi (true, 42)');

  const valueNodes = nodes.filter(n => n.type === 'value');
  assert(valueNodes.length === 1, '1 nodo valore stringa (test)');
}

title('Test 5: Array di stringhe');
{
  const arr = {
    tags: ['alpha', 'beta', 'gamma'],
  };

  const { nodes, links } = parseJSONToGraph(arr);

  // tags → [3] → alpha, beta, gamma
  const valueNodes = nodes.filter(n => n.type === 'value');
  assert(valueNodes.length === 3, '3 nodi valore per array di 3 stringhe');

  // Ci dovrebbe essere un nodo chiave per l'array sintetico [3]
  const arrNode = nodes.find(n => n.label === '[3]');
  assert(!!arrNode, 'Nodo array sintetico [3] esiste');
}

title('Test 6: Nessun duplicato nei link');
{
  const pkg = {
    a: {
      x: '1',
      y: '1',
    },
  };

  const { nodes, links } = parseJSONToGraph(pkg);

  // Verifica che non ci siano link duplicati
  const linkKeys = links.map(l => l.source + '->' + l.target);
  const uniqueLinkKeys = new Set(linkKeys);
  assert(linkKeys.length === uniqueLinkKeys.size, 'Nessun link duplicato');
}

title('Test 7: Chiavi duplicate in contesti diversi');
{
  const dup = {
    prod: {
      lib: 'axios',
    },
    dev: {
      lib: 'jest',
    },
  };

  const { nodes } = parseJSONToGraph(dup);

  // 'lib' dovrebbe apparire due volte (in prod e in dev)
  const libNodes = nodes.filter(n => n.label === 'lib' && n.type === 'key');
  assert(libNodes.length === 2, 'La chiave "lib" appare in due contesti diversi');
}

// ============================================================
// Riepilogo
// ============================================================
console.log('\n' + '='.repeat(50));
console.log(`Risultati: ${passed} passati, ${failed} falliti su ${passed + failed} test`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ Tutti i test passati!');
  process.exit(0);
}
