import contextlib
import copy
import io
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent))
import engine


def fixture():
    rows = [{'id': str(i), 'composition': {'Fe': 65 + i * .5, 'B': 35 - i * .5},
             'features': {'size': 10 + i % 4, 'phase': 'A' if i % 2 else 'B'},
             'targets': {'Tg': 500 + i * 3}, 'source': 'source-' + str(i // 3)} for i in range(48)]
    return {'revision': 0, 'properties': [{'id': 'Tg', 'name': 'Tg', 'unit': 'K', 'requiredFeatures': []}],
            'features': [{'id': 'size', 'name': 'size', 'type': 'number', 'unit': ''}, {'id': 'phase', 'name': 'phase', 'type': 'category', 'unit': ''}],
            'datasets': [{'id': 'synthetic', 'form': 'powder', 'basis': 'at', 'rows': rows}]}


def train(ws, **options):
    with contextlib.redirect_stdout(io.StringIO()):
        return engine.train({'workspace': ws, 'options': dict(target='Tg', form='powder', basis='at', datasetIds=['synthetic'],
                                                             algorithms=['ridge', 'elastic_net'], trees=32, threads=1, **options)})


class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ws = fixture()
        cls.ws['datasets'][0]['rows'][2]['features'].pop('size')
        cls.model = train(cls.ws, validation='source')

    def test_nested_group_evaluation_and_roundtrip(self):
        m = self.model
        self.assertTrue(m['usable'])
        self.assertLess(m['metrics']['mae'], m['metrics']['baselineMAE'] / 10)
        self.assertEqual(m['metrics']['groups'], 16)
        self.assertEqual(len(m['validationPoints']), 48)
        for fold in m['metrics']['folds']:
            self.assertFalse(set(fold['trainingGroups']) & set(fold['testingGroups']))
        result = engine.predict({'model': json.loads(json.dumps(m)), 'rows': [self.ws['datasets'][0]['rows'][20]]})[0]
        self.assertAlmostEqual(result['value'], 560, delta=2)
        self.assertEqual(m['training']['evaluation'], 'nested-group-cv-5x3')
        self.assertGreater(len(m['training']['leaderboard']), 1)

    def test_alloy_descriptors_use_atomic_fractions(self):
        wt = engine.alloy_schema(['Fe', 'Cu'], 'wt')
        at = engine.alloy_schema(['Fe', 'Cu'], 'at')
        x_fe = 63.546 / (63.546 + 55.845)
        self.assertAlmostEqual(engine.alloy_values([.5, .5], wt)[2], x_fe * 26 + (1 - x_fe) * 29)
        self.assertAlmostEqual(engine.alloy_values([.5, .5], at)[2], 27.5)
        self.assertIsNone(engine.alloy_schema(['Fe', 'Og'], 'wt'))
        self.assertNotIn('电负性加权均值', engine.alloy_schema(['Fe', 'He'], 'at')['names'])

    def test_alloy_model_persists_and_marks_joint_extrapolation(self):
        model = train(fixture(), validation='source', descriptorMode='alloy')
        self.assertTrue(model['usable'])
        self.assertEqual(model['training']['compositionFeatures']['mode'], 'alloy')
        self.assertEqual(len(model['training']['compositionFeatures']['selected']), 8)
        self.assertIn('配方整体', {x['name'] for x in model['featureImportance']})
        rows = [{'composition': {'Fe': 75, 'B': 25}, 'features': {}},
                {'composition': {'Fe': 100, 'B': 0}, 'features': {}}]
        results = engine.predict({'model': json.loads(json.dumps(model)), 'rows': rows})
        self.assertFalse(results[0]['compositionDomain']['outside'])
        self.assertTrue(results[1]['compositionDomain']['outside'])
        self.assertIn('超过参考距离', ' '.join(results[1]['warnings']))

        # All individual element fractions can be within their training ranges
        # while the full candidate is far from both alloy families.
        chemistry = [dict(composition={'Fe': fe, 'Co': (100-fe)/2, 'Ni': (100-fe)/2})
                     for fe in (60, 61, 62, 78, 79, 80)]
        schema = engine.schema_for([dict(r, features={}) for r in chemistry], [], [])
        domain = engine.composition_domain(chemistry, schema['elements'])
        candidate = {'composition': {'Fe': 70, 'Co': 20, 'Ni': 10}}
        for el, (lo, hi) in schema['ranges'].items():
            self.assertTrue(lo <= candidate['composition'][el] <= hi)
        info = engine.nearest_compositions({'encoder': schema, 'compositionDomain': domain}, [candidate])[0]
        self.assertTrue(info['outside'])
        self.assertGreater(info['distance'], info['threshold'])

    def test_inference_domains_and_missing_values(self):
        rows = [dict(composition={'Fe': 75, 'Cu': 25}, features={}),
                dict(composition={'Fe': 95, 'B': 5}, features={}),
                dict(composition={'Fe': 75, 'B': 25}, features={'phase': 'unknown'})]
        results = engine.predict({'model': self.model, 'rows': rows})
        self.assertIn('未包含元素', results[0]['error'])
        self.assertTrue(results[1]['warnings'])
        self.assertIn('未见的类别', results[2]['error'])

    def test_integrity_and_environment_are_checked(self):
        m = copy.deepcopy(self.model)
        m['artifact']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, '校验'):
            engine.predict({'model': m, 'rows': []})
        m = copy.deepcopy(self.model)
        m['environment']['scikit-learn'] = 'invalid'
        with self.assertRaisesRegex(ValueError, '版本'):
            engine.predict({'model': m, 'rows': []})

    def test_source_components_and_required_category(self):
        ws = fixture()
        rows = ws['datasets'][0]['rows']
        rows[3]['source'] = rows[0]['source'] + ' | ' + rows[3]['source']
        groups = engine.groups_for(rows, 'source')
        self.assertEqual(groups[0], groups[5])
        ws['properties'][0]['requiredFeatures'] = ['phase']
        model = train(ws)
        self.assertTrue(model['usable'])
        result = engine.predict({'model': model, 'rows': [{'composition': rows[0]['composition'], 'features': {}}]})[0]
        self.assertIn('请补充', result['error'])
        rows[0]['features'].pop('phase')
        with self.assertRaisesRegex(ValueError, '必填'):
            train(ws)


    def test_duplicate_source_links_and_legacy_provenance(self):
        ws = fixture()
        rows = ws['datasets'][0]['rows']
        duplicate = copy.deepcopy(rows[0])
        duplicate.update(id='duplicate', source=rows[3]['source'],
                         provenance={'excelRow': 42, 'sample': 'old observation'})
        rows.append(duplicate)
        selected = engine.training_rows(ws, dict(target='Tg', form='powder', basis='at',
                                                 datasetIds=['synthetic']))
        self.assertEqual(len(selected), 48)
        self.assertEqual(selected[0]['source'], 'source-0 | source-1')
        self.assertEqual(selected[0]['provenance'][1]['excelRow'], 42)
        groups = engine.groups_for(selected, 'source')
        self.assertEqual(groups[0], groups[3])

    def test_log_target_roundtrip_and_original_units(self):
        ws = fixture()
        for i, row in enumerate(ws['datasets'][0]['rows']):
            row['targets']['Tg'] = float(engine.np.exp(i / 8))
        m = train(ws, targetScale='log', inputMode='composition')
        self.assertTrue(m['usable'])
        self.assertEqual(m['encoder']['specs'], [])
        self.assertEqual(m['training']['targetScale'], 'log')
        self.assertEqual(m['metrics']['baselineKind'], 'median')
        self.assertEqual(m['targetRange'][0], 1)
        self.assertGreater(m['targetRange'][1], 300)
        result = engine.predict({'model': json.loads(json.dumps(m)), 'rows': [ws['datasets'][0]['rows'][20]]})[0]
        self.assertAlmostEqual(result['value'], float(engine.np.exp(2.5)), delta=.1)
        self.assertGreater(result['interval'][0], 0)
        self.assertEqual(result['intervalKind'], 'multiplicative')
        self.assertAlmostEqual(result['interval'][1] / result['value'], result['value'] / result['interval'][0])
        self.assertAlmostEqual(m['validationPoints'][20]['actual'], float(engine.np.exp(2.5)))
        ws['datasets'][0]['rows'][0]['targets']['Tg'] = 0
        with self.assertRaisesRegex(ValueError, '严格大于'):
            train(ws, targetScale='log')

    def test_design_inputs_exclude_measured_phase_and_require_contract(self):
        ws = fixture()
        self.assertEqual(engine.selected_features(ws, {'inputMode': 'composition'}), [])
        self.assertEqual(engine.selected_features(ws, {'inputMode': 'process'}), [])
        ws['features'].append({'id': 'annealTime', 'name': 'Anneal time', 'type': 'number', 'unit': 'min'})
        self.assertEqual([f['id'] for f in engine.selected_features(ws, {'inputMode': 'process'})], ['annealTime'])
        ws['properties'][0]['requiredFeatures'] = ['phase']
        with self.assertRaisesRegex(ValueError, '预测场景'):
            train(ws, inputMode='composition')

    def test_source_normalization_and_conflicting_inputs(self):
        ws = fixture(); rows = ws['datasets'][0]['rows']
        rows[0]['source'] = 'https://doi.org/10.1000/ABC'
        rows[3]['source'] = 'DOI:10.1000/abc'
        groups = engine.groups_for(rows, 'source')
        self.assertEqual(groups[0], groups[3])
        rows[1]['source'] = ''
        rows[1]['composition'] = rows[0]['composition'].copy()
        audit = engine.data_audit(rows, [], engine.groups_for(rows, 'source'),
                                  {'target': 'Tg', 'form': 'powder', 'inputMode': 'composition'})
        self.assertEqual(audit['missingSources'], 1)
        self.assertEqual(audit['conflictingInputs'], 1)

    def test_small_constant_and_single_group_data(self):
        ws = fixture()
        ws['datasets'][0]['rows'] = ws['datasets'][0]['rows'][:10]
        with self.assertRaisesRegex(ValueError, '15'):
            train(ws)
        ws = fixture()
        for row in ws['datasets'][0]['rows']:
            row['source'] = 'same'
        with self.assertRaisesRegex(ValueError, '5'):
            train(ws, validation='source')
        for row in ws['datasets'][0]['rows']:
            row['targets']['Tg'] = 1
        self.assertFalse(train(ws)['usable'])

    def test_each_official_estimator_and_safe_serialization(self):
        ws = fixture()
        rows = ws['datasets'][0]['rows']
        schema = engine.schema_for(rows, ws['features'], [])
        X = engine.matrix(rows, schema)
        y = engine.np.array([r['targets']['Tg'] for r in rows])
        options = {'algorithms': list(engine.ALGORITHMS), 'seed': 8427, 'trees': 32, 'threads': 1, 'search': 'standard'}
        for grid in engine.candidates(options):
            model = grid['regressor__model'][0]
            with self.subTest(model=type(model).__name__), engine.threadpool_limits(limits=1):
                pipeline = engine.TransformedTargetRegressor(regressor=engine.Pipeline([('preprocess', engine.preprocessing(schema)), ('model', model)]), transformer=engine.StandardScaler())
                pipeline.fit(X, y)
                raw = engine.sio.dumps(pipeline)
                self.assertFalse(set(engine.sio.get_untrusted_types(data=raw)) - set(engine.TRUSTED_TYPES))
                loaded = engine.sio.loads(raw, trusted=engine.TRUSTED_TYPES)
                engine.np.testing.assert_allclose(loaded.predict(X), pipeline.predict(X))

    def test_preprocessing_only_learns_training_rows(self):
        ws = fixture()
        rows = ws['datasets'][0]['rows']
        rows[-1]['features']['phase'] = 'HELD_OUT_ONLY'
        rows[-1]['features']['size'] = 1000000
        schema = engine.schema_for(rows, ws['features'], [])
        prep = engine.preprocessing(schema)
        prep.fit(engine.matrix(rows[:-1], schema))
        self.assertNotIn('HELD_OUT_ONLY', prep.named_transformers_['category'].categories_[0])
        self.assertLess(prep.named_transformers_['numeric'].named_steps['impute'].statistics_[-1], 20)


if __name__ == '__main__':
    unittest.main(verbosity=2)
