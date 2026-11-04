"""Local regression engine. JSON lines in/out; no network, pickle, or user code."""
import base64
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import sys
import time
import uuid
import warnings
from zipfile import ZIP_DEFLATED

import numpy as np
import sklearn
import skops.io as sio
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor, HistGradientBoostingRegressor, GradientBoostingRegressor
from sklearn.impute import SimpleImputer
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
                 'sklearn.neural_network._stochastic_optimizers.SGDOptimizer']


def emit(value):
    print(json.dumps(value, ensure_ascii=False, allow_nan=False), flush=True)


def versions():
    return {name: importlib.metadata.version(name) for name in ['scikit-learn', 'numpy', 'scipy', 'skops', 'joblib']}


def composition_key(c):
    return '|'.join(f'{e}:{float(n):.5f}' for e, n in sorted(c.items()) if n > 0)


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
            keys.extend((seen_s, s.strip().lower()) for s in row['source'].split(' | ') if s.strip())
        for seen, key in keys:
            if key in seen:
                parent[find(i)] = find(seen[key])
            else:
                seen[key] = i
    return np.array([find(i) for i in range(len(rows))])


def schema_for(rows, features, required):
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
    return {'elements': elements, 'specs': specs,
            'featureNames': elements + [f['name'] for f in specs],
            'ranges': {e: [min(r['composition'].get(e, 0) for r in rows), max(r['composition'].get(e, 0) for r in rows)] for e in elements}}


def matrix(rows, schema):
    return np.array([[r['composition'].get(e, 0) / 100 for e in schema['elements']] +
                     [(r['features'].get(f['id']) if r['features'].get(f['id']) not in [None, ''] else np.nan) if f['type'] == 'number'
                      else str(r['features'].get(f['id']) if r['features'].get(f['id']) not in [None, ''] else '__MISSING__') for f in schema['specs']]
                    for r in rows], dtype=object)


def preprocessing(schema):
    num = list(range(len(schema['elements'])))
    cat = []
    for i, f in enumerate(schema['specs'], len(num)):
        (num if f['type'] == 'number' else cat).append(i)
    transformers = [('numeric', Pipeline([('impute', SimpleImputer(strategy='median', add_indicator=True, keep_empty_features=True)),
                                         ('scale', StandardScaler())]), num)]
    if cat:
        transformers.append(('category', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cat))
    return ColumnTransformer(transformers, remainder='drop')


def candidates(options):
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
        grid.append({'regressor__model': [model], **{'regressor__model__' + k: v for k, v in params.items()}})
    return grid


def clean_params(params):
    return {('algorithm' if k == 'regressor__model' else k.replace('regressor__model__', '')): (type(v).__name__ if k == 'regressor__model' else v) for k, v in params.items()}


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
    if not options['algorithms'] or any(n not in ALGORITHMS for n in options['algorithms']):
        raise ValueError('请选择支持的算法')
    for key, low, high in [('trees', 32, 2048), ('threads', 1, 32), ('seed', 0, 2147483647)]:
        if type(options[key]) is not int or not low <= options[key] <= high:
            raise ValueError('训练参数无效：' + key)
    if options['validation'] not in ['composition', 'source'] or options['search'] not in ['standard', 'thorough']:
        raise ValueError('验证或搜索设置无效')
    target = options['target']
    prop = next(p for p in ws['properties'] if p['id'] == target)
    rows, seen = [], set()
    for ds in ws['datasets']:
        if ds['id'] not in options['datasetIds'] or ds['form'] != options['form'] or ds['basis'] != options['basis']:
            continue
        for r in ds['rows']:
            y = r['targets'].get(target)
            if not isinstance(y, (float, int)) or not math.isfinite(y):
                continue
            signature = json.dumps([composition_key(r['composition']), r['features'], y], sort_keys=True)
            if signature in seen:
                continue
            seen.add(signature)
            rows.append(dict(r, datasetId=ds['id']))
    if len(rows) < 15:
        raise ValueError('至少需要 15 条有效标签')
    required = prop.get('requiredFeatures', [])
    if any(r['features'].get(f) in [None, ''] for r in rows for f in required):
        raise ValueError('训练记录缺少目标必填描述符，请补齐后重训')
    groups = groups_for(rows, options['validation'])
    if len(set(groups)) < 5:
        raise ValueError('至少需要 5 个独立成分／来源连通分组')
    schema = schema_for(rows, ws['features'], required)
    X, y = matrix(rows, schema), np.array([r['targets'][target] for r in rows], dtype=float)
    pipeline = TransformedTargetRegressor(regressor=Pipeline([('preprocess', preprocessing(schema)), ('model', Ridge())]), transformer=StandardScaler())
    grid = candidates(options)
    def search(indices, salt):
        inner = GroupKFold(n_splits=min(3, len(set(groups[indices]))), shuffle=True, random_state=options['seed'] + salt)
        result = GridSearchCV(pipeline, grid, scoring='neg_mean_absolute_error', cv=inner, refit=True, n_jobs=1, error_score='raise', return_train_score=True)
        result.fit(X[indices], y[indices], groups=groups[indices])
        return result
    outer = GroupKFold(n_splits=5, shuffle=True, random_state=options['seed'])
    predicted, baseline = np.empty(len(y)), np.empty(len(y))
    fold_ids, folds, importances = np.empty(len(y), dtype=int), [], []
    caught_messages = []
    with threadpool_limits(limits=options['threads']), warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        for fold, (tr, te) in enumerate(outer.split(X, y, groups)):
            emit({'progress': f'外层验证 {fold + 1}/5：内层分组调参与算法比较…'})
            result = search(tr, fold + 1)
            predicted[te] = result.predict(X[te])
            baseline[te] = DummyRegressor(strategy='mean').fit(X[tr], y[tr]).predict(X[te])
            fold_ids[te] = fold + 1
            importance = permutation_importance(result.best_estimator_, X[te], y[te], scoring='neg_mean_absolute_error', n_repeats=3,
                                                random_state=options['seed'] + fold, max_samples=min(200, len(te)), n_jobs=1)
            importances.append(importance.importances_mean)
            folds.append({'training': len(tr), 'testing': len(te), 'trainingGroups': sorted(set(groups[tr].tolist())),
                          'testingGroups': sorted(set(groups[te].tolist())), 'mae': mean_absolute_error(y[te], predicted[te]),
                          'baselineMAE': mean_absolute_error(y[te], baseline[te]), 'bestParams': clean_params(result.best_params_)})
        emit({'progress': '使用全部数据分组调参，训练最终模型并保存报告…'})
        final = search(np.arange(len(y)), 100)
        caught_messages = sorted({str(w.message) for w in caught})[:20]
    mae, base = mean_absolute_error(y, predicted), mean_absolute_error(y, baseline)
    p90 = float(np.quantile(np.abs(y - predicted), .9))
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
    fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return {'id': str(uuid.uuid4()), 'algorithm': 'sklearn-regression-v1', 'target': target, 'property': prop,
            'form': options['form'], 'basis': options['basis'], 'datasetIds': options['datasetIds'], 'revision': ws['revision'],
            'createdAt': int(time.time() * 1000), 'encoder': schema, 'estimator': type(final.best_estimator_.regressor_.named_steps['model']).__name__,
            'artifact': {'format': 'skops', 'sha256': hashlib.sha256(artifact).hexdigest(), 'data': base64.b64encode(artifact).decode('ascii')},
            'environment': versions(), 'training': {'options': options, 'dataSHA256': fingerprint, 'seconds': time.monotonic() - started,
                                                   'bestParams': clean_params(final.best_params_), 'leaderboard': leaderboard, 'warnings': caught_messages,
                                                   'evaluation': 'nested-group-cv-5x3', 'python': platform.python_version()},
            'metrics': {'n': len(rows), 'groups': len(set(groups)), 'compositions': len({composition_key(r['composition']) for r in rows}),
                        'features': X.shape[1], 'mae': mae, 'rmse': math.sqrt(mean_squared_error(y, predicted)), 'r2': float(r2_score(y, predicted)) if np.ptp(y) else None,
                        'baselineMAE': base, 'errorP90': p90, 'validation': options['validation'], 'folds': folds},
            'validationPoints': [{'actual': float(y[i]), 'predicted': float(predicted[i]), 'baseline': float(baseline[i]), 'fold': int(fold_ids[i]),
                                  'group': int(groups[i]), 'rowId': r.get('id'), 'datasetId': r['datasetId'], 'source': r.get('source', '')} for i, r in enumerate(rows)],
            'featureImportance': sorted([{'name': name, 'importance': float(importance_array[:, i].mean()), 'std': float(importance_array[:, i].std())}
                                         for i, name in enumerate(schema['featureNames'])], key=lambda r: -r['importance']),
            'usable': bool(mae < base and np.ptp(y) > 0), 'targetRange': [float(y.min()), float(y.max())]}


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
        for index, value in zip(valid_indices, values):
            value, p90 = float(value), model['metrics']['errorP90']
            results[index].update(value=value, mae=model['metrics']['mae'], errorP90=p90, interval=[value - p90, value + p90])
    return results


def main():
    request = json.load(sys.stdin)
    action = request.get('action')
    if action == 'status':
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
