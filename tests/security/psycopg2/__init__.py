"""Shim of psycopg2 backed by psycopg (v3).

Supabase's transaction pooler on port 6543 does not send a
ParameterStatus for client_encoding at startup, which psycopg2 rejects
with "server didn't return client encoding". psycopg (v3) handles this
correctly, so we route the small subset of psycopg2 features the
security tests use through it.
"""
from __future__ import annotations

import psycopg as _pg
from psycopg import ClientCursor as _ClientCursor
from psycopg import errors  # re-export module
from psycopg.rows import dict_row as _dict_row

from . import extras  # noqa: F401



class _CursorWrap:
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=None):
        return self._cur.execute(sql, params)

    def fetchall(self):
        return self._cur.fetchall()

    def fetchone(self):
        return self._cur.fetchone()

    def close(self):
        self._cur.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self._cur.close()


class _ConnectionWrap:
    def __init__(self, conn):
        self._conn = conn
        self._conn.autocommit = True  # match psycopg2 default of manual tx via BEGIN

    def cursor(self, cursor_factory=None):
        row_factory = _dict_row if cursor_factory is extras.RealDictCursor else None
        return _CursorWrap(self._conn.cursor(row_factory=row_factory) if row_factory else self._conn.cursor())

    def rollback(self):
        try:
            self._conn.rollback()
        except Exception:
            pass

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def connect(**kwargs):
    # psycopg accepts the same keyword args (host/port/user/password/dbname)
    return _ConnectionWrap(_pg.connect(**kwargs))
