import os
import unittest

os.environ['DATABASE_URL'] = 'sqlite://'

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.database import Base, get_db
from backend.app.main import app


class AppearancePreferencesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)

        def test_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.pop(get_db, None)
        self.client.close()
        self.engine.dispose()

    def test_shared_appearance_and_reader_preferences_round_trip_together(self):
        settings = self.client.get('/api/preferences').json()['settings']
        settings.update({
            'theme': 'midnight', 'uiTheme': 'dark', 'uiStyle': 'liquid',
            'pageThemes': {'light': 'sepia', 'dark': 'midnight'},
            'fontFamily': 'mono', 'fontSize': 27,
        })
        response = self.client.put('/api/preferences', json={'settings': settings})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/api/preferences').json()['settings'], settings)

        # Changing mode on the home screen keeps the book's typography and both palettes.
        settings.update({'theme': 'sepia', 'uiTheme': 'light'})
        self.assertEqual(self.client.put('/api/preferences', json={'settings': settings}).status_code, 200)
        loaded = self.client.get('/api/preferences').json()['settings']
        self.assertEqual(loaded, settings)
        self.assertEqual(loaded['fontSize'], 27)
        self.assertEqual(loaded['pageThemes']['dark'], 'midnight')
