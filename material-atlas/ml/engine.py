"""Local regression engine. JSON lines in/out; no network, pickle, or user code."""
import base64
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import re
import sys
import time
import uuid
import warnings
from zipfile import ZIP_DEFLATED
from pathlib import Path

import numpy as np
import sklearn
import skops.io as sio
from scipy.spatial import cKDTree
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor, HistGradientBoostingRegressor, GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.feature_selection import SelectKBest, f_regression
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge, ElasticNet
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, GroupKFold
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVR
from threadpoolctl import threadpool_limits

ALGORITHMS = {
    'extra_trees': 'Extra Trees', 'random_forest': 'Random Forest',
    'hist_gradient_boosting': 'HistGradientBoosting', 'gradient_boosting': 'Gradient Boosting',
    'ridge': 'Ridge', 'elastic_net': 'Elastic Net', 'svr': 'SVR (RBF)', 'mlp': 'MLP 神经网络',
}
# Explicit, fixed allowlist; never trust types supplied by the imported artifact.
TRUSTED_TYPES = ['numpy.dtype', 'sklearn._loss.loss.HalfSquaredError', 'sklearn._loss.link.IdentityLink',
                 'sklearn._loss.link.Interval', 'sklearn.ensemble._hist_gradient_boosting.binning._BinMapper',
                 'sklearn._loss._loss.CyHalfSquaredError',
                 'sklearn.ensemble._hist_gradient_boosting.predictor.TreePredictor',
                 'sklearn.neural_network._stochastic_optimizers.AdamOptimizer',
                 'sklearn.neural_network._stochastic_optimizers.SGDOptimizer',
                 'sklearn.feature_selection._univariate_selection.f_regression']


def emit(value):
    print(json.dumps(value, ensure_ascii=False, allow_nan=False), flush=True)


def versions():
    return {name: importlib.metadata.version(name) for name in ['scikit-learn', 'numpy', 'scipy', 'skops', 'joblib']}


def composition_key(c):
    return '|'.join(f'{e}:{float(n):.5f}' for e, n in sorted(c.items()) if n > 0)


# Explicitly known design-time inputs. Measured structure is opt-in, never inferred
# from a target (e.g. assigning phase by a coercivity threshold).
PROCESS_FEATURES = {'annealing_temperature', 'annealing_time', 'wheel_surface_speed', 'cooling_rate_estimate', 'melt_ejection_temperature', 'cond_freq_hz', 'cond_flux_t', 'cond_temp_k', 'particleSize', 'annealTemperature', 'annealTime', 'pressure', 'binder',
                    'frequency', 'induction', 'testTemperature', 'biasField', 'method', 'coating',
                    'thickness', 'synthesisTemperature', 'synthesisTime', 'coolingRate',
                    'atmosphere', 'substrate', 'mgOSizeNm', 'measurementTemperatureKind',
                    'treatmentState', 'meanParticleSize', 'particleLower', 'particleUpper',
                    'measurementField', 'dscRate', 'millingTime', 'millingSpeed'}


def selected_features(ws, options):
    mode = options.get('inputMode', 'all')
    if mode not in ['composition', 'process', 'all']:
        raise ValueError('预测场景无效')
    return [f for f in ws['features'] if mode == 'all' or
            (mode == 'process' and f['id'] in PROCESS_FEATURES)]


def source_keys(row):
    keys = []
    for source in row.get('source', '').split(' | '):
        source = source.strip().lower()
        source = re.sub(r'^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)', '', source)
        if source:
            # Bare bibliography numbers only have meaning within their own collection.
            if source.isdigit():
                source = str(row.get('datasetId', '')) + ':reference:' + source
            keys.append(source)
    return keys


def data_audit(rows, features, groups, options):
    inputs = {}
    for row in rows:
        key = json.dumps([composition_key(row['composition']),
                          {f['id']: row['features'].get(f['id']) for f in features}], sort_keys=True)
        inputs.setdefault(key, set()).add(row['targets'][options['target']])
    sizes = [int(np.sum(groups == g)) for g in set(groups)]
    warnings = []
    missing = sum(not source_keys(r) for r in rows)
    conflict = sum(len(v) > 1 for v in inputs.values())
    if missing:
        warnings.append(f'{missing} 条记录缺少原始来源，来源验证无法完全隔离这些记录。')
    if conflict:
        warnings.append(f'{conflict} 组相同输入对应不同实测值，保留各观测；可能涉及重复测量或未记录条件。')
    coverage = [{'id': f['id'], 'name': f['name'],
                 'present': sum(r['features'].get(f['id']) not in [None, ''] for r in rows)} for f in features]
    if options['target'] in ['Hc', 'hcOe'] and not any(f['present'] for f in coverage):
        warnings.append('Hc 仅依据成分估计；没有工艺与组织输入，不能据此承诺退火或制粉后的矫顽力。')
    if '待核' in options['form'] or '未注明' in options['form']:
        warnings.append('训练材料形态尚未逐行核验；结果仅用于该文献集合内的初步筛选，不能当作粉末性能。')
    if options['form'] == 'powder':
        warnings.append('粉末模型不适用于带材、块体或压制磁芯；非晶与纳米晶合并时必须保留真实工艺和测试条件。')
        if len(sizes) < 10:
            warnings.append(f'仅 {len(sizes)} 个独立成分／来源组；即使通过运行门槛，折外误差仍可能不稳定。')
        for key, label in [('method', '制粉方法'), ('treatmentState', '处理状态')]:
            absent = sum(r['features'].get(key) in [None, ''] for r in rows)
            if absent:
                warnings.append(f'{absent} 条粉末记录缺少{label}；不能据此保证新制备路线的性能。')
    if options.get('inputMode', 'all') == 'all':
        warnings.append('使用全部已录入字段；实测组织与其他表征量须在预测前已知，不能由待预测性能反推。')
    return {'rows': len(rows), 'groups': len(sizes), 'largestGroup': max(sizes),
            'missingSources': missing, 'conflictingInputs': conflict, 'featureCoverage': coverage,
            'warnings': warnings}


def evaluation_summary(y, predicted, baseline, groups):
    return {'mae': float(mean_absolute_error(y, predicted)),
            'rmse': float(math.sqrt(mean_squared_error(y, predicted))),
            'r2': float(r2_score(y, predicted)) if np.ptp(y) else None,
            'baselineMAE': float(mean_absolute_error(y, baseline)),
            'groupMAE': float(np.mean([mean_absolute_error(y[groups == g], predicted[groups == g])
                                      for g in set(groups)]))}


def groups_for(rows, validation):
    parent = list(range(len(rows)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    seen_c, seen_s = {}, {}
    for i, row in enumerate(rows):
        keys = [(seen_c, composition_key(row['composition']))]
        if validation == 'source' and row.get('source', '').strip():
            # Import allows multiple DOI/source entries joined by " | ".
            keys.extend((seen_s, s) for s in source_keys(row))
        for seen, key in keys:
            if key in seen:
                parent[find(i)] = find(seen[key])
            else:
                seen[key] = i
    return np.array([find(i) for i in range(len(rows))])


ALLOY_PROPERTIES = {
    'Number': '原子序数', 'AtomicWeight': '原子量', 'CovalentRadius': '共价半径',
    'Electronegativity': '电负性', 'MeltingT': '元素熔点', 'NValence': '价电子数',
}


def alloy_schema(elements, basis):
    table = json.loads(Path(__file__).with_name('elemental-magpie.json').read_text(encoding='utf-8'))
    records = [table['elements'][e] for e in elements]
    mass = [r.get('AtomicWeight') for r in records]
    if basis == 'wt' and any(x is None or x <= 0 for x in mass):
        return None
    properties = {k: [r[k] for r in records] for k in ALLOY_PROPERTIES if all(k in r for r in records)}
    names = ['组分元素数', '理想混合熵/R']
    names += [ALLOY_PROPERTIES[k] + suffix for k in properties for suffix in ('加权均值', '加权标准差')]
    return {'basis': basis, 'atomicMass': mass if basis == 'wt' else None,
            'properties': list(properties.values()), 'names': names, 'source': table['source']}


def alloy_values(fractions, schema):
    x = np.array(fractions, dtype=float)
    if schema['atomicMass'] is not None:
        x /= schema['atomicMass']
    x /= x.sum()
    nonzero = x[x > 0]
    result = [float(len(nonzero)), float(-np.dot(nonzero, np.log(nonzero)))]
    for values in schema['properties']:
        mean = np.dot(x, values)
        spread = np.sqrt(np.dot(x, (np.array(values) - mean) ** 2))
        result.extend((float(mean), float(spread)))
    return result


def composition_domain(rows, elements):
    points = np.unique(np.array([[round(r['composition'].get(e, 0), 5) for e in elements]
                                  for r in rows], dtype=float), axis=0)
    # Half L1 in percentage points is the amount transferred between elements.
    tree = cKDTree(points)
    distances, _ = tree.query(points, k=2, p=1)
    return {'points': points.tolist(), 'threshold': float(np.quantile(distances[:, 1] / 2, .95))}


def nearest_compositions(model, rows):
    domain = model.get('compositionDomain')
    if domain is None:
        return [None] * len(rows)
    elements = model['encoder']['elements']
    points = np.asarray(domain['points'], dtype=float)
    threshold = domain['threshold']
    if (points.ndim != 2 or not 2 <= len(points) <= 30000 or points.shape[1] != len(elements)
            or not np.isfinite(points).all() or np.any((points < 0) | (points > 100))
            or not isinstance(threshold, (int, float)) or not 0 <= threshold <= 100):
        raise ValueError('保存的成分适用域无效')
    query = [[r['composition'].get(e, 0) for e in elements] for r in rows]
    distances, _ = cKDTree(points).query(query, p=1)
    return [{'distance': float(d / 2), 'threshold': threshold, 'outside': bool(d / 2 > threshold + .0001)}
            for d in distances]


def schema_for(rows, features, required, basis=None):
    elements = sorted({e for r in rows for e, n in r['composition'].items() if n > 0})
    specs = []
    for f in features:
        values = [r['features'][f['id']] for r in rows if r['features'].get(f['id']) is not None]
        if not values:
            continue
        spec = dict(f, required=f['id'] in required)
        if f['type'] == 'number':
            if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
                raise ValueError(f['name'] + '必须为有限数值')
            spec.update(min=min(values), max=max(values))
        else:
            spec['categories'] = sorted(set(map(str, values)))
            if len(spec['categories']) > 200:
                raise ValueError(f['name'] + '类别超过 200，请不要把编号当作描述符')
        specs.append(spec)
    schema = {'elements': elements, 'specs': specs,
              'featureNames': elements + [f['name'] for f in specs],
              'ranges': {e: [min(r['composition'].get(e, 0) for r in rows),
                             max(r['composition'].get(e, 0) for r in rows)] for e in elements}}
    if basis is not None and (alloy := alloy_schema(elements, basis)) is not None:
        schema['alloy'] = alloy
        schema['featureNames'] += alloy['names']
    return schema


def matrix(rows, schema):
    values = []
    for r in rows:
        fractions = [r['composition'].get(e, 0) / 100 for e in schema['elements']]
        inputs = []
        for f in schema['specs']:
            value = r['features'].get(f['id'])
            if f['type'] == 'number':
                inputs.append(np.nan if value in [None, ''] else value)
            else:
                inputs.append('__MISSING__' if value in [None, ''] else str(value))
        derived = alloy_values(fractions, schema['alloy']) if 'alloy' in schema else []
        values.append(fractions + inputs + derived)
    return np.array(values, dtype=object)


def preprocessing(schema):
    num = list(range(len(schema['elements'])))
    cat = []
    for i, f in enumerate(schema['specs'], len(num)):
        (num if f['type'] == 'number' else cat).append(i)
    transformers = [('numeric', Pipeline([('impute', SimpleImputer(strategy='median', add_indicator=True, keep_empty_features=True)),
                                         ('scale', StandardScaler())]), num)]
    if cat:
        transformers.append(('category', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cat))
    if 'alloy' in schema:
        start = len(schema['elements']) + len(schema['specs'])
        transformers.append(('alloy', 'drop', list(range(start, len(schema['featureNames'])))))
    return ColumnTransformer(transformers, remainder='drop')


def descriptor_choices(schema, mode):
    if 'alloy' not in schema:
        return {}
    # The supervised selector is fitted by GridSearchCV on the current training fold.
    selector = Pipeline([('select', SelectKBest(f_regression, k=min(8, len(schema['alloy']['names'])))),
                         ('scale', StandardScaler())])
    choices = ['drop', selector] if mode == 'auto' else [selector]
    return {'regressor__preprocess__alloy': choices}


def composition_importance(estimator, X, y, schema, seed):
    if 'alloy' not in schema:
        return permutation_importance(estimator, X, y, scoring='neg_mean_absolute_error', n_repeats=3,
                                      random_state=seed, max_samples=min(200, len(y)), n_jobs=1).importances_mean
    rng = np.random.default_rng(seed)
    sample = rng.choice(len(y), min(200, len(y)), replace=False)
    X, y = X[sample], y[sample]
    baseline = mean_absolute_error(y, estimator.predict(X))
    n_elements = len(schema['elements'])
    n_conditions = len(schema['specs'])
    # Permute the fractions and derived descriptors together to keep chemistry consistent.
    composition = list(range(n_elements)) + list(range(n_elements + n_conditions, X.shape[1]))
    blocks = [composition] + [[i] for i in range(n_elements, n_elements + n_conditions)]
    result = []
    for columns in blocks:
        errors = []
        for _ in range(3):
            shuffled = X.copy()
            shuffled[:, columns] = X[rng.permutation(len(X))][:, columns]
            errors.append(mean_absolute_error(y, estimator.predict(shuffled)) - baseline)
        result.append(np.mean(errors))
    return result


def candidates(options, schema=None):
    seed, trees, threads = options['seed'], options['trees'], options['threads']
    models = {
        'extra_trees': (ExtraTreesRegressor(n_estimators=trees, random_state=seed, n_jobs=threads), {'min_samples_leaf': [1, 2], 'max_features': [1.0, .7]}),
        'random_forest': (RandomForestRegressor(n_estimators=trees, random_state=seed, n_jobs=threads), {'min_samples_leaf': [1, 2], 'max_features': [1.0, .7]}),
        'hist_gradient_boosting': (HistGradientBoostingRegressor(max_iter=250, early_stopping=False, random_state=seed), {'max_leaf_nodes': [15, 31], 'l2_regularization': [0., 1.]}),
        'gradient_boosting': (GradientBoostingRegressor(n_estimators=trees, random_state=seed), {'max_depth': [2, 3], 'learning_rate': [.03, .1]}),
        'ridge': (Ridge(), {'alpha': [.01, 1., 10., 100.]}),
        'elastic_net': (ElasticNet(max_iter=10000, random_state=seed), {'alpha': [.001, .01], 'l1_ratio': [.2, .8]}),
        'svr': (SVR(cache_size=512), {'C': [1., 10., 100.], 'gamma': ['scale', .1]}),
        'mlp': (MLPRegressor(max_iter=1500, early_stopping=False, random_state=seed), {'hidden_layer_sizes': [(64, 32), (128, 64)], 'alpha': [.001, .1]}),
    }
    grid = []
    for name in options['algorithms']:
        model, params = models[name]
        if options['search'] == 'standard':
            params = {key: values[:1] if key in ['max_features', 'learning_rate', 'l1_ratio', 'gamma', 'alpha'] and name not in ['ridge', 'elastic_net'] else values for key, values in params.items()}
        grid.append({'regressor__model': [model], **{'regressor__model__' + k: v for k, v in params.items()},
                     **descriptor_choices(schema or {}, options.get('descriptorMode', 'fractions'))})
    return grid


def clean_params(params):
    cleaned = {}
    for key, value in params.items():
        if key == 'regressor__model':
            cleaned['algorithm'] = type(value).__name__
        elif key == 'regressor__preprocess__alloy':
            cleaned['descriptors'] = 'fractions' if value == 'drop' else 'alloy'
        else:
            cleaned[key.replace('regressor__model__', '')] = value
    return cleaned


_COMPOSITION_MASSES = json.loads(Path(__file__).with_name('elemental-magpie.json').read_text(encoding='utf-8'))['elements']

def convert_composition(composition, source, target):
    if source not in ['at', 'mol', 'formula', 'wt'] or target not in ['at', 'mol', 'formula', 'wt']:
        raise ValueError('成分基准不受支持')
    if source == target:
        return dict(composition)
    masses = _COMPOSITION_MASSES
    result = {}
    for element, value in composition.items():
        if value and (source == 'wt') != (target == 'wt'):
            mass = masses.get(element, {}).get('AtomicWeight')
            if mass is None or mass <= 0:
                raise ValueError(element + ' 缺少原子量，无法转换成分')
            value = value / mass if source == 'wt' else value * mass
        result[element] = value
    total = sum(result.values())
    if total <= 0:
        raise ValueError('成分合计必须大于零')
    return {element: value / total * 100 for element, value in result.items()}


def training_rows(ws, options):
    """Deduplicate labels while retaining all source links before grouping."""
    rows, seen = [], {}
    target = options['target']
    for ds in ws['datasets']:
        if ds['id'] not in options['datasetIds']:
            continue
        for original in ds['rows']:
            if original.get('form', ds['form']) != options['form']:
                continue
            r = dict(original, composition=convert_composition(original['composition'], ds['basis'], options['basis']))
            y = r['targets'].get(target)
            if not isinstance(y, (float, int)) or not math.isfinite(y):
                continue
            signature = json.dumps([composition_key(r['composition']), r['features'], y], sort_keys=True)
            provenance = r.get('provenance')
            if not isinstance(provenance, list) or not provenance:
                legacy = provenance if isinstance(provenance, dict) else {}
                provenance = [dict({'row': r.get('row'), 'source': r.get('source', ''),
                                    'original': r.get('original', {})}, **legacy)]
            provenance = [dict(p, datasetId=ds['id'], rowId=r.get('id')) for p in provenance]
            if signature in seen:
                existing = seen[signature]
                existing['source'] = ' | '.join(dict.fromkeys(s.strip() for value in [existing.get('source', ''), r.get('source', '')]
                                                             for s in value.split(' | ') if s.strip()))
                existing['provenance'].extend(provenance)
                continue
            row = dict(r, datasetId=ds['id'], provenance=provenance)
            seen[signature] = row
            rows.append(row)
    return rows


def train(payload):
    started = time.monotonic()
    ws, options = payload['workspace'], payload['options']
    options = dict(options)
    options.setdefault('algorithms', ['extra_trees', 'random_forest', 'hist_gradient_boosting', 'ridge', 'elastic_net', 'svr'])
    options.setdefault('seed', 8427)
    options.setdefault('trees', 256)
    options.setdefault('threads', min(4, os.cpu_count() or 1))
    options.setdefault('search', 'standard')
    options.setdefault('validation', 'composition')
    options.setdefault('descriptorMode', 'fractions')
    options.setdefault('inputMode', 'all')
    options.setdefault('targetScale', 'raw')
    if options['targetScale'] not in ['auto', 'raw', 'log']:
        raise ValueError('目标尺度无效')
    if options['descriptorMode'] not in ['auto', 'fractions', 'alloy']:
        raise ValueError('成分特征模式无效')
    if not options['algorithms'] or any(n not in ALGORITHMS for n in options['algorithms']):
        raise ValueError('请选择支持的算法')
    for key, low, high in [('trees', 32, 2048), ('threads', 1, 32), ('seed', 0, 2147483647)]:
        if type(options[key]) is not int or not low <= options[key] <= high:
            raise ValueError('训练参数无效：' + key)
    if options['validation'] not in ['composition', 'source'] or options['search'] not in ['standard', 'thorough']:
        raise ValueError('验证或搜索设置无效')
    target = options['target']
    prop = next(p for p in ws['properties'] if p['id'] == target)
    rows = training_rows(ws, options)
    if len(rows) < 15:
        raise ValueError('至少需要 15 条有效标签')
    required = prop.get('requiredFeatures', [])
    features = selected_features(ws, options)
    excluded_required = set(required) - {f['id'] for f in features}
    if excluded_required:
        raise ValueError('当前预测场景未包含目标必填输入：' + '、'.join(sorted(excluded_required)))
    if any(r['features'].get(f) in [None, ''] for r in rows for f in required):
        raise ValueError('训练记录缺少目标必填描述符，请补齐后重训')
    groups = groups_for(rows, options['validation'])
    if len(set(groups)) < 5:
        raise ValueError('至少需要 5 个独立成分／来源连通分组')
    mode = options['descriptorMode']
    schema = schema_for(rows, features, required, options['basis'] if mode != 'fractions' else None)
    if mode == 'alloy' and 'alloy' not in schema:
        raise ValueError('元素原子量不完整，无法将质量百分比转换为原子比例。请改用原始配比。')
    X, observed = matrix(rows, schema), np.array([r['targets'][target] for r in rows], dtype=float)
    scale = 'log' if options['targetScale'] == 'log' or (options['targetScale'] == 'auto' and target in ['Hc', 'hcOe']) else 'raw'
    if scale == 'log' and np.any(observed <= 0):
        raise ValueError('对数建模要求所有标签严格大于 0；请核查零值、负值或选择原单位建模，不会自动加常数。')
    y = np.log(observed) if scale == 'log' else observed.copy()
    audit = data_audit(rows, features, groups, options)
    pipeline = TransformedTargetRegressor(regressor=Pipeline([('preprocess', preprocessing(schema)), ('model', Ridge())]), transformer=StandardScaler())
    grid = candidates(options, schema)
    def search(indices, salt):
        inner = GroupKFold(n_splits=min(3, len(set(groups[indices]))), shuffle=True, random_state=options['seed'] + salt)
        result = GridSearchCV(pipeline, grid, scoring='neg_mean_absolute_error', cv=inner, refit=True, n_jobs=1, error_score='raise', return_train_score=True)
        result.fit(X[indices], y[indices], groups=groups[indices])
        return result
    outer = GroupKFold(n_splits=5, shuffle=True, random_state=options['seed'])
    predicted, baseline = np.empty(len(y)), np.empty(len(y))
    raw_median, raw_mean = np.empty(len(y)), np.empty(len(y))
    fold_ids, folds, importances = np.empty(len(y), dtype=int), [], []
    caught_messages = []
    with threadpool_limits(limits=options['threads']), warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        for fold, (tr, te) in enumerate(outer.split(X, y, groups)):
            emit({'progress': f'外层验证 {fold + 1}/5：内层分组调参与算法比较…'})
            result = search(tr, fold + 1)
            predicted[te] = result.predict(X[te])
            baseline[te] = np.median(y[tr])
            raw_median[te], raw_mean[te] = np.median(observed[tr]), np.mean(observed[tr])
            fold_ids[te] = fold + 1
            importances.append(composition_importance(result.best_estimator_, X[te], y[te], schema,
                                                       options['seed'] + fold))
            folds.append({'training': len(tr), 'testing': len(te), 'trainingGroups': sorted(set(groups[tr].tolist())),
                          'testingGroups': sorted(set(groups[te].tolist())), 'mae': mean_absolute_error(y[te], predicted[te]),
                          'baselineMAE': mean_absolute_error(y[te], baseline[te]), 'bestParams': clean_params(result.best_params_)})
        emit({'progress': '使用全部数据分组调参，训练最终模型并保存报告…'})
        final = search(np.arange(len(y)), 100)
        caught_messages = sorted({str(w.message) for w in caught})[:20]
    selection_metrics = evaluation_summary(y, predicted, baseline, groups)
    if scale == 'log':
        predicted = np.exp(predicted)
    if not np.isfinite(predicted).all():
        raise ValueError('模型预测溢出，请检查数据或改用树模型。')
    raw_metrics = evaluation_summary(observed, predicted, raw_median, groups)
    mae, base = raw_metrics['mae'], raw_metrics['baselineMAE']
    p90 = float(np.quantile(np.abs(observed - predicted), .9))
    passed_folds = sum(f['mae'] < f['baselineMAE'] for f in folds)
    usable = bool(selection_metrics['mae'] < selection_metrics['baselineMAE'] and
                  (selection_metrics['r2'] or 0) > 0 and passed_folds >= 3)
    for f in folds:
        mask = fold_ids == folds.index(f) + 1
        f['rawMAE'] = float(mean_absolute_error(observed[mask], predicted[mask]))
    log_metrics = None
    if np.all(observed > 0) and np.all(predicted > 0):
        log_metrics = evaluation_summary(np.log(observed), np.log(predicted), np.log(raw_median), groups)
        log_metrics['errorP90'] = float(np.quantile(np.abs(np.log(observed) - np.log(predicted)), .9))
        log_metrics['factorP90'] = float(np.exp(log_metrics['errorP90']))
    leaderboard = []
    for i, params in enumerate(final.cv_results_['params']):
        leaderboard.append({'params': clean_params(params), 'mae': -float(final.cv_results_['mean_test_score'][i]),
                            'std': float(final.cv_results_['std_test_score'][i]), 'trainMAE': -float(final.cv_results_['mean_train_score'][i]),
                            'fitSeconds': float(final.cv_results_['mean_fit_time'][i])})
    leaderboard.sort(key=lambda r: r['mae'])
    artifact = sio.dumps(final.best_estimator_, compression=ZIP_DEFLATED)
    unknown = set(sio.get_untrusted_types(data=artifact)) - set(TRUSTED_TYPES)
    if unknown:
        raise ValueError('模型包含未支持的持久化类型：' + ', '.join(sorted(unknown)))
    # Verify the saved estimator, not only the in-memory estimator.
    restored = sio.loads(artifact, trusted=TRUSTED_TYPES)
    np.testing.assert_allclose(restored.predict(X[:5]), final.predict(X[:5]), rtol=1e-10, atol=1e-10)
    importance_array = np.array(importances)
    best_params = clean_params(final.best_params_)
    selected = []
    if best_params.get('descriptors') == 'alloy':
        fitted = final.best_estimator_.regressor_.named_steps['preprocess'].named_transformers_['alloy']
        selected = [name for name, keep in zip(schema['alloy']['names'], fitted['select'].get_support()) if keep]
    importance_names = ['配方整体'] + [f['name'] for f in schema['specs']] if 'alloy' in schema else schema['featureNames']
    if mode == 'auto' and 'alloy' not in schema:
        caught_messages.append('元素原子量不完整，自动比较退回原始配比。')
    fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return {'id': str(uuid.uuid4()), 'algorithm': 'sklearn-regression-v1', 'target': target, 'property': prop,
            'form': options['form'], 'basis': options['basis'], 'datasetIds': options['datasetIds'], 'revision': ws['revision'],
            'createdAt': int(time.time() * 1000), 'encoder': schema, 'estimator': type(final.best_estimator_.regressor_.named_steps['model']).__name__,
            'artifact': {'format': 'skops', 'sha256': hashlib.sha256(artifact).hexdigest(), 'data': base64.b64encode(artifact).decode('ascii')},
            'environment': versions(), 'training': {'options': options, 'dataSHA256': fingerprint, 'seconds': time.monotonic() - started,
                                                   'bestParams': best_params, 'leaderboard': leaderboard, 'warnings': caught_messages + audit['warnings'],
                                                   'targetScale': scale, 'dataAudit': audit,
                                                   'assessment': {'passedFolds': passed_folds, 'usable': usable,
                                                                  'reason': '优于中位数基线、折外 R² > 0，且至少 3/5 折优于基线' if usable else '未同时满足中位数基线、正 R² 与多数验证折要求'},
                                                   'compositionFeatures': {'mode': best_params.get('descriptors', 'fractions'),
                                                                           'selected': selected, 'dataSource': schema.get('alloy', {}).get('source')},
                                                   'evaluation': 'nested-group-cv-5x3', 'python': platform.python_version()},
            'compositionDomain': composition_domain(rows, schema['elements']),
            'metrics': {'n': len(rows), 'groups': len(set(groups)), 'compositions': len({composition_key(r['composition']) for r in rows}),
                        'features': len(schema['elements']) + len(schema['specs']) + len(selected), **raw_metrics,
                        'baselineKind': 'median', 'meanBaselineMAE': float(mean_absolute_error(observed, raw_mean)),
                        'selection': selection_metrics, 'log': log_metrics,
                        'baselineMAE': base, 'errorP90': p90, 'validation': options['validation'], 'folds': folds},
            'validationPoints': [{'actual': float(observed[i]), 'predicted': float(predicted[i]), 'baseline': float(raw_median[i]), 'fold': int(fold_ids[i]),
                                  'group': int(groups[i]), 'rowId': r.get('id'), 'datasetId': r['datasetId'], 'source': r.get('source', ''), 'provenance': r.get('provenance', [])} for i, r in enumerate(rows)],
            'featureImportance': sorted([{'name': name, 'importance': float(importance_array[:, i].mean()), 'std': float(importance_array[:, i].std())}
                                         for i, name in enumerate(importance_names)], key=lambda r: -r['importance']),
            'usable': usable, 'targetRange': [float(observed.min()), float(observed.max())]}


def predict(payload):
    model, rows = payload['model'], payload['rows']
    if model.get('algorithm') != 'sklearn-regression-v1' or not model.get('usable'):
        raise ValueError('模型未通过验证或格式不受支持')
    if model['environment'] != versions():
        raise ValueError('模型训练库版本与当前环境不同，请用原环境或重新训练')
    artifact = model['artifact']
    raw = base64.b64decode(artifact['data'], validate=True)
    if hashlib.sha256(raw).hexdigest() != artifact['sha256']:
        raise ValueError('模型文件校验失败')
    estimator = sio.loads(raw, trusted=TRUSTED_TYPES)
    results, valid_rows, valid_indices = [], [], []
    for row in rows:
        try:
            schema, notes = model['encoder'], []
            c = row['composition']
            if not c or any(not isinstance(v, (float, int)) or not math.isfinite(v) or v < 0 or v > 100 for v in c.values()) or abs(sum(c.values()) - 100) > .15:
                raise ValueError('元素百分比必须合计 100%')
            unknown = [e for e, v in c.items() if v > 0 and e not in schema['elements']]
            if unknown:
                raise ValueError('训练数据未包含元素：' + '、'.join(unknown))
            for e, (lo, hi) in schema['ranges'].items():
                if c.get(e, 0) < lo - .0001 or c.get(e, 0) > hi + .0001:
                    notes.append(e + '含量超出训练范围')
            for f in schema['specs']:
                v = row['features'].get(f['id'])
                if v is None or v == '':
                    if f['required']:
                        raise ValueError('请补充：' + f['name'])
                    notes.append(f['name'] + '缺失，使用训练时的缺失值处理')
                elif f['type'] == 'number':
                    if not isinstance(v, (int, float)) or not math.isfinite(v):
                        raise ValueError(f['name'] + '必须为数值')
                    if not f['min'] <= v <= f['max']:
                        notes.append(f['name'] + '超出训练范围')
                elif str(v) not in f['categories']:
                    raise ValueError(f['name'] + '含训练中未见的类别：' + str(v))
            valid_indices.append(len(results))
            valid_rows.append(row)
            results.append({'warnings': notes})
        except ValueError as exc:
            results.append({'error': str(exc)})
    if valid_rows:
        values = estimator.predict(matrix(valid_rows, model['encoder']))
        if model.get('training', {}).get('targetScale') == 'log':
            values = np.exp(values)
        domains = nearest_compositions(model, valid_rows)
        for index, value, domain in zip(valid_indices, values, domains):
            value, p90 = float(value), model['metrics']['errorP90']
            if not math.isfinite(value):
                results[index] = {'error': '该输入导致预测溢出，请检查输入或更换模型'}
                continue
            results[index]['warnings'].extend(model.get('training', {}).get('dataAudit', {}).get('warnings', []))
            selection = model['metrics'].get('selection', {})
            if selection.get('r2') is not None and selection['r2'] < .5:
                results[index]['warnings'].append('分组验证解释能力较弱，仅适合初步筛选；请结合原单位误差判断候选能否区分。')
            results[index].update(value=value, mae=model['metrics']['mae'], errorP90=p90, interval=[value - p90, value + p90])
            if model.get('training', {}).get('targetScale') == 'log':
                factor = model['metrics']['log']['factorP90']
                results[index].update(interval=[value / factor, value * factor], intervalKind='multiplicative', factorP90=factor)
            if domain is not None:
                results[index]['compositionDomain'] = domain
                if domain['outside']:
                    results[index]['warnings'].append(
                        f"配方距最近训练样品 {domain['distance']:.3g} 个百分点，超过参考距离 {domain['threshold']:.3g}。"
                        "历史误差带对该配方仅供参考。")
    return results


def main():
    request = json.load(sys.stdin)
    action = request.get('action')
    if action == 'status':
        alloy_schema(['Fe'], 'at')  # Verify that packaged descriptor data can be read.
        result = {'ready': True, 'engine': 'scikit-learn', 'versions': versions(), 'algorithms': ALGORITHMS, 'python': platform.python_version()}
    elif action == 'train':
        result = train(request)
    elif action == 'predict':
        with threadpool_limits(limits=4):
            result = predict(request)
    else:
        raise ValueError('未知机器学习操作')
    emit({'result': result})


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit({'error': str(exc)})
        sys.exit(1)
